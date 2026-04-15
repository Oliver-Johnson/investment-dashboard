import time
import yfinance as yf
from datetime import datetime, timedelta
from src.db import get_db

CACHE_TTL_MINUTES = 15
_gbpusd_cache: dict = {}


def _get_gbpusd_rate() -> float:
    now = datetime.utcnow()
    cached = _gbpusd_cache.get("rate")
    if cached and (now - cached["fetched"]).total_seconds() < 60:
        return cached["value"]
    rate = yf.Ticker("GBPUSD=X").fast_info["lastPrice"]
    _gbpusd_cache["rate"] = {"value": rate, "fetched": now}
    return rate


def get_price_gbp(ticker: str) -> float:
    """Fetch current price in GBP, using DB cache (15 min TTL)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT price_gbp, last_fetched FROM price_cache WHERE ticker = %s",
                (ticker,)
            )
            row = cur.fetchone()
            if row:
                age = datetime.utcnow() - row["last_fetched"].replace(tzinfo=None)
                if age < timedelta(minutes=CACHE_TTL_MINUTES):
                    return float(row["price_gbp"])

            price = _fetch_price_gbp(ticker)

            cur.execute(
                """INSERT INTO price_cache (ticker, price_gbp, last_fetched)
                   VALUES (%s, %s, NOW())
                   ON CONFLICT (ticker) DO UPDATE
                   SET price_gbp = EXCLUDED.price_gbp, last_fetched = NOW()""",
                (ticker, price)
            )
            return price


def _fetch_price_gbp(ticker: str) -> float:
    info = yf.Ticker(ticker).fast_info
    price = info["lastPrice"]

    if ticker.endswith(".L"):
        # London Stock Exchange prices are in pence — convert to pounds
        return price / 100.0

    # US ticker — convert USD to GBP
    gbpusd = _get_gbpusd_rate()
    return price / gbpusd
