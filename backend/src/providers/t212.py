import base64
import os
import time
import requests
from decimal import Decimal
from src.providers.yfinance_client import _get_gbpusd_rate

T212_BASE_URL = os.getenv("T212_BASE_URL", "https://demo.trading212.com/api/v0")
T212_API_KEY = os.getenv("T212_API_KEY", "")
T212_API_SECRET = os.getenv("T212_API_SECRET", "")


def _auth_header() -> dict:
    token = base64.b64encode(f"{T212_API_KEY}:{T212_API_SECRET}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def fetch_portfolio() -> list[dict]:
    """Fetch T212 portfolio positions. Returns list of position dicts in GBP."""
    if not T212_API_KEY:
        return []

    headers = _auth_header()
    try:
        resp = requests.get(f"{T212_BASE_URL}/equity/portfolio", headers=headers, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"T212 API error: {e}") from e

    time.sleep(2)  # Rate limiting

    positions = resp.json()
    results = []

    gbpusd = None

    for pos in positions:
        ticker = pos.get("ticker", "")
        quantity = Decimal(str(pos.get("quantity", 0)))
        avg_price = Decimal(str(pos.get("averagePrice", 0)))
        current_price = Decimal(str(pos.get("currentPrice", 0)))
        # T212 may not include currency per position; derive from ticker
        currency = pos.get("currency")
        if not currency:
            currency = "USD" if "_US_" in ticker else "GBP"
        ppl_gbp = pos.get("ppl")  # profit/loss in account currency (GBP)
        market_value = quantity * current_price

        if currency == "USD":
            if gbpusd is None:
                gbpusd = Decimal(str(_get_gbpusd_rate()))
            market_value_gbp = market_value / gbpusd
            current_price_gbp = current_price / gbpusd
        else:
            market_value_gbp = market_value
            current_price_gbp = current_price

        result = {
            "ticker": ticker,
            "quantity": quantity,
            "avg_price": avg_price,
            "current_price_gbp": current_price_gbp,
            "market_value_gbp": market_value_gbp,
        }
        if ppl_gbp is not None:
            result["ppl_gbp"] = Decimal(str(ppl_gbp))
        results.append(result)

    return results
