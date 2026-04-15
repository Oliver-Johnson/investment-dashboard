import base64
import os
import time
import requests
from decimal import Decimal
from functools import lru_cache
from src.providers.yfinance_client import _get_gbpusd_rate

# 5-minute portfolio cache to avoid slow repeated T212 API calls on every page load
_portfolio_cache: dict = {"data": None, "expires": 0.0}

T212_BASE_URL = os.getenv("T212_BASE_URL", "https://demo.trading212.com/api/v0")
T212_API_KEY = os.getenv("T212_API_KEY", "")
T212_API_SECRET = os.getenv("T212_API_SECRET", "")


def _auth_header() -> dict:
    token = base64.b64encode(f"{T212_API_KEY}:{T212_API_SECRET}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


@lru_cache(maxsize=1)
def _instrument_metadata() -> dict:
    """Fetch T212 instrument metadata. Returns {ticker: {currency, name}} map."""
    if not T212_API_KEY:
        return {}
    try:
        resp = requests.get(
            f"{T212_BASE_URL}/equity/metadata/instruments",
            headers=_auth_header(),
            timeout=30,
        )
        resp.raise_for_status()
        return {
            inst["ticker"]: {
                "currency": inst.get("currencyCode", "GBP"),
                "name": inst.get("name") or inst.get("fullName") or inst.get("shortName") or "",
            }
            for inst in resp.json()
        }
    except Exception:
        return {}


def _price_to_gbp(price: Decimal, currency: str, gbpusd_ref: list) -> Decimal:
    """Convert a price in `currency` to GBP. gbpusd_ref is a 1-element list used
    as a mutable cache so we only fetch GBPUSD once per portfolio call."""
    if currency == "GBP":
        return price
    if currency == "GBX":
        # Pence → pounds
        return price / 100
    if currency == "USD":
        if not gbpusd_ref[0]:
            gbpusd_ref[0] = Decimal(str(_get_gbpusd_rate()))
        return price / gbpusd_ref[0]
    # Unknown currency — return as-is
    return price


def fetch_portfolio() -> list[dict]:
    """Fetch T212 portfolio positions. Returns list of position dicts in GBP.
    Results are cached for 5 minutes to avoid slow repeated API calls."""
    if not T212_API_KEY:
        return []

    now = time.time()
    if _portfolio_cache["data"] is not None and now < _portfolio_cache["expires"]:
        return _portfolio_cache["data"]

    headers = _auth_header()
    try:
        resp = requests.get(f"{T212_BASE_URL}/equity/portfolio", headers=headers, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"T212 API error: {e}") from e

    positions = resp.json()
    metadata = _instrument_metadata()
    gbpusd_ref = [None]  # mutable cache for lazy GBPUSD fetch
    results = []

    for pos in positions:
        ticker = pos.get("ticker", "")
        # T212 `quantity` already includes pie holdings; `pieQuantity` is a subset
        quantity = Decimal(str(pos.get("quantity", 0)))
        avg_price = Decimal(str(pos.get("averagePrice", 0)))
        current_price = Decimal(str(pos.get("currentPrice", 0)))
        ppl_gbp = pos.get("ppl")

        # Use instrument metadata for currency; fall back to ticker heuristic
        ticker_meta = metadata.get(ticker, {})
        if not ticker_meta:
            # T212 variant tickers: SMSNl_EQ → try SMSN_EQ (strip char before _EQ)
            import re as _re
            base = _re.sub(r'[0-9a-z](_EQ)$', r'\1', ticker)
            if base != ticker:
                ticker_meta = metadata.get(base, {})
        currency = ticker_meta.get("currency") or ("USD" if "_US_" in ticker else "GBP")
        display_name = ticker_meta.get("name", "")

        current_price_gbp = _price_to_gbp(current_price, currency, gbpusd_ref)
        avg_price_gbp = _price_to_gbp(avg_price, currency, gbpusd_ref)
        market_value_gbp = quantity * current_price_gbp

        result = {
            "ticker": ticker,
            "display_name": display_name,
            "quantity": quantity,
            "avg_price": avg_price_gbp,
            "current_price_gbp": current_price_gbp,
            "market_value_gbp": market_value_gbp,
        }
        if ppl_gbp is not None:
            result["ppl_gbp"] = Decimal(str(ppl_gbp))
        results.append(result)

    _portfolio_cache["data"] = results
    _portfolio_cache["expires"] = time.time() + 300  # cache for 5 minutes
    return results


def fetch_cash_balance() -> dict | None:
    """Return T212 cash balance: {free, currency}. Returns None on error."""
    if not T212_API_KEY:
        return None
    try:
        resp = requests.get(f"{T212_BASE_URL}/equity/account/cash", headers=_auth_header(), timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return {"free": float(data.get("free", 0)), "currency": data.get("currency", "GBP")}
    except Exception:
        return None
