import os
import requests
from decimal import Decimal
from src.providers.yfinance_client import _get_gbpusd_rate

ETORO_BASE_URL = os.getenv("ETORO_BASE_URL", "https://api.etoro.com/api")
ETORO_API_KEY = os.getenv("ETORO_API_KEY", "")
ETORO_USERNAME = os.getenv("ETORO_USERNAME", "")


def _auth_header() -> dict:
    return {"Authorization": f"Bearer {ETORO_API_KEY}"}


def fetch_portfolio() -> list[dict]:
    """Fetch open positions from eToro and return normalised holding dicts.

    Returns a list of dicts with keys:
        ticker, display_name, quantity, currency,
        current_price_gbp, market_value_gbp

    TODO: verify the exact endpoint path and response field names against the
    eToro API docs for your account type. The structure below matches the
    public/partner REST API pattern — adjust field names if needed.
    """
    if not ETORO_API_KEY or not ETORO_USERNAME:
        return []

    # TODO: confirm this path is correct for your eToro API tier
    url = f"{ETORO_BASE_URL}/user/v1/users/{ETORO_USERNAME}/portfolio"
    try:
        resp = requests.get(url, headers=_auth_header(), timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"eToro API error: {e}")

    data = resp.json()

    # TODO: adjust the top-level key if the response wraps positions differently
    # e.g. data["positions"], data["openPositions"], data["portfolio"], etc.
    positions = data.get("positions", data.get("openPositions", []))

    gbpusd = None
    results = []
    for pos in positions:
        # TODO: confirm field names — eToro may use "instrumentID", "ticker",
        # "symbol", or "isin" for the instrument identifier
        ticker = pos.get("ticker") or pos.get("instrumentID") or pos.get("symbol", "")
        display_name = pos.get("instrumentName") or pos.get("displayName")

        # TODO: confirm quantity field name ("units", "amount", "quantity")
        quantity = Decimal(str(pos.get("units") or pos.get("amount") or pos.get("quantity", 0)))

        # TODO: confirm price field name ("currentRate", "currentPrice", "rate")
        current_price = Decimal(str(pos.get("currentRate") or pos.get("currentPrice") or pos.get("rate", 0)))

        # eToro typically quotes in USD; adjust if your account is GBP-denominated
        currency = pos.get("currency", "USD")
        market_value = quantity * current_price

        if currency == "USD":
            if gbpusd is None:
                gbpusd = Decimal(str(_get_gbpusd_rate()))
            market_value_gbp = market_value / gbpusd
            current_price_gbp = current_price / gbpusd
        else:
            market_value_gbp = market_value
            current_price_gbp = current_price

        results.append({
            "ticker": ticker,
            "display_name": display_name,
            "quantity": quantity,
            "currency": currency,
            "current_price_gbp": current_price_gbp,
            "market_value_gbp": market_value_gbp,
        })

    return results
