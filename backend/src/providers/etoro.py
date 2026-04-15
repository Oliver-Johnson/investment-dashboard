import os
import uuid
import requests
from decimal import Decimal
from functools import lru_cache
from src.providers.yfinance_client import _get_gbpusd_rate

ETORO_BASE_URL = "https://public-api.etoro.com"
ETORO_API_KEY = os.getenv("ETORO_API_KEY", "")    # Public API Key
ETORO_USER_KEY = os.getenv("ETORO_USER_KEY", "") or os.getenv("ETORO_USERNAME", "")  # User Key


def _auth_headers() -> dict:
    # eToro's header naming is counterintuitive:
    # x-api-key expects the private/user key; x-user-key expects the public key
    return {
        "x-request-id": str(uuid.uuid4()),
        "x-api-key": ETORO_USER_KEY,
        "x-user-key": ETORO_API_KEY,
    }


@lru_cache(maxsize=1)
def _instrument_names(instrument_ids_tuple: tuple) -> dict:
    """Fetch instrument display names. Returns {id: name}."""
    if not instrument_ids_tuple:
        return {}
    ids_str = ",".join(str(i) for i in instrument_ids_tuple)
    try:
        resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/instruments",
            params={"instrumentIds": ids_str},
            headers=_auth_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        # Response wraps in instrumentDisplayDatas; field names use lowercase
        instruments = data.get("instrumentDisplayDatas", data if isinstance(data, list) else [])
        return {
            inst.get("instrumentId"): (
                inst.get("displayname")
                or inst.get("internalInstrumentDisplayName")
                or inst.get("symbol")
                or inst.get("internalSymbolFull")
                or f"Instrument {inst.get('instrumentId', '?')}"
            )
            for inst in instruments
            if inst.get("instrumentId")
        }
    except Exception:
        return {}


def fetch_portfolio() -> list[dict]:
    """Fetch open positions from eToro. Returns list of normalised holding dicts.

    Auth: x-api-key (Public API Key) + x-user-key (User Key)
    Endpoint: GET /api/v1/trading/info/portfolio
    Response: {clientPortfolio: {positions: [{instrumentID, units, amount, unitsBaseValueDollars, ...}]}}

    All monetary values from eToro are in USD. Convert to GBP using GBPUSD rate.
    """
    if not ETORO_API_KEY or not ETORO_USER_KEY:
        raise RuntimeError(
            "eToro credentials not configured. Set ETORO_API_KEY (public key) "
            "and ETORO_USER_KEY (user key) in .env"
        )

    try:
        resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/trading/info/portfolio",
            headers=_auth_headers(),
            timeout=15,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"eToro API error: {e}")

    data = resp.json()
    positions = (
        data.get("clientPortfolio", {}).get("positions", [])
        or data.get("positions", [])
    )
    mirrors = data.get("clientPortfolio", {}).get("mirrors", [])

    if not positions and not mirrors:
        return []

    # Collect ALL instrument IDs (direct + mirror positions) before fetching names
    all_instrument_ids = {pos.get("instrumentID") for pos in positions if pos.get("instrumentID")}
    for mirror in mirrors:
        for pos in mirror.get("positions", []):
            if pos.get("instrumentID"):
                all_instrument_ids.add(pos["instrumentID"])

    instrument_ids = tuple(sorted(all_instrument_ids))
    names = _instrument_names(instrument_ids)

    gbpusd = Decimal(str(_get_gbpusd_rate()))
    results = []

    for pos in positions:
        instrument_id = pos.get("instrumentID", 0)
        units = Decimal(str(pos.get("units", 0)))
        # amount = current USD value of position; unitsBaseValueDollars = unit-level value
        value_usd = Decimal(str(
            pos.get("amount")
            or pos.get("unitsBaseValueDollars", 0)
            or 0
        ))
        # Derive price per unit from value / units (avoid div by zero)
        price_usd = (value_usd / units) if units else Decimal("0")

        market_value_gbp = value_usd / gbpusd
        current_price_gbp = price_usd / gbpusd

        display_name = names.get(instrument_id) or f"eToro #{instrument_id}"
        ticker = str(instrument_id)  # eToro uses numeric IDs, not tickers

        results.append({
            "ticker": ticker,
            "display_name": display_name,
            "quantity": units,
            "currency": "USD",
            "current_price_gbp": current_price_gbp,
            "market_value_gbp": market_value_gbp,
        })

    # Also include copytrade (mirror) positions
    for mirror in mirrors:
        mirror_name = mirror.get("parentUsername", "Copy Trade")
        for pos in mirror.get("positions", []):
            instrument_id = pos.get("instrumentID", 0)
            units = Decimal(str(pos.get("units", 0)))
            value_usd = Decimal(str(pos.get("amount") or pos.get("unitsBaseValueDollars", 0) or 0))
            price_usd = (value_usd / units) if units else Decimal("0")
            market_value_gbp = value_usd / gbpusd
            current_price_gbp = price_usd / gbpusd
            display_name = names.get(instrument_id) or f"eToro #{instrument_id}"
            results.append({
                "ticker": str(instrument_id),
                "display_name": f"{display_name} (via {mirror_name})",
                "quantity": units,
                "currency": "USD",
                "current_price_gbp": current_price_gbp,
                "market_value_gbp": market_value_gbp,
            })

    return results
