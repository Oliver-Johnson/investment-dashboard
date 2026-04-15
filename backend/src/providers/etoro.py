import os
import time
import uuid
import requests
from decimal import Decimal
from functools import lru_cache
from src.providers.yfinance_client import _get_gbpusd_rate

# 5-minute portfolio cache to avoid slow repeated eToro API calls
_portfolio_cache: dict = {"data": None, "expires": 0.0}
_cash_cache: dict = {"data": None, "expires": 0.0}

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
def _all_instrument_names() -> dict:
    """Fetch ALL eToro instrument names via search API. Returns {instrumentId(int): name}.

    Primary: private market-data/instruments endpoint (500s for individual API keys).
    Fallback: market-data/search with large pageSize — works with individual keys.
    """
    # Try private instruments API first
    try:
        resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/instruments",
            headers=_auth_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        instruments = data.get("instrumentDisplayDatas", data if isinstance(data, list) else [])
        if instruments:
            return {
                inst.get("instrumentId"): (
                    inst.get("displayname")
                    or inst.get("internalInstrumentDisplayName")
                    or inst.get("internalSymbolFull")
                    or f"eToro #{inst.get('instrumentId', '?')}"
                )
                for inst in instruments
                if inst.get("instrumentId")
            }
    except Exception:
        pass

    # Fallback: paginate search endpoint — returns all instruments with display names.
    # The search API ignores 'limit' param and defaults to pageSize=20; paginate instead.
    try:
        name_map: dict = {}
        page = 1
        while True:
            resp = requests.get(
                f"{ETORO_BASE_URL}/api/v1/market-data/search",
                params={"text": "", "page": page, "pageSize": 500},
                headers=_auth_headers(),
                timeout=30,
            )
            resp.raise_for_status()
            body = resp.json()
            items = body.get("items", [])
            for inst in items:
                iid = inst.get("internalInstrumentId")
                if iid:
                    name_map[iid] = (
                        inst.get("internalInstrumentDisplayName")
                        or inst.get("internalSymbolFull")
                        or f"eToro #{iid}"
                    )
            total = body.get("totalItems", 0)
            if len(name_map) >= total or not items:
                break
            page += 1
            if page > 50:  # safety cap: 50 pages × 500 = 25000 instruments
                break
        return name_map
    except Exception:
        return {}


def _instrument_names(instrument_ids_tuple: tuple) -> dict:
    """Look up names for specific instrument IDs from the cached full map."""
    all_names = _all_instrument_names()
    if not instrument_ids_tuple:
        return all_names
    return {iid: all_names.get(iid, f"eToro #{iid}") for iid in instrument_ids_tuple}


def fetch_portfolio() -> list[dict]:
    """Fetch open positions from eToro. Returns list of normalised holding dicts.
    Results are cached for 5 minutes to avoid slow repeated API calls.
    """
    now = time.time()
    if _portfolio_cache["data"] is not None and now < _portfolio_cache["expires"]:
        return _portfolio_cache["data"]

    if not ETORO_API_KEY or not ETORO_USER_KEY:
        raise RuntimeError(
            "eToro credentials not configured. Set ETORO_API_KEY (public key) "
            "and ETORO_USER_KEY (user key) in .env"
        )

    try:
        resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/trading/info/portfolio",
            headers=_auth_headers(),
            timeout=20,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        # On timeout/error, return stale cache if available rather than crashing
        if _portfolio_cache["data"] is not None:
            return _portfolio_cache["data"]
        raise RuntimeError(f"eToro API error: {e}")

    data = resp.json()
    client_portfolio = data.get("clientPortfolio", {})
    positions = client_portfolio.get("positions", []) or data.get("positions", [])
    mirrors = client_portfolio.get("mirrors", [])

    # Cache cash balance from portfolio response
    # eToro reports cash in USD; grab whichever field is available
    raw_cash_usd = (
        client_portfolio.get("availableToTrade")
        or client_portfolio.get("creditByRealizedEquity")
        or client_portfolio.get("credit")
        or 0
    )
    _cash_cache["data"] = {"free_usd": float(raw_cash_usd)}
    _cash_cache["expires"] = time.time() + 300

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

    _portfolio_cache["data"] = results
    _portfolio_cache["expires"] = time.time() + 300  # cache for 5 minutes
    return results


def fetch_cash_balance() -> dict | None:
    """Return eToro cash balance in GBP: {free, currency}. Returns None on error."""
    # Trigger portfolio fetch if needed (populates _cash_cache)
    if _cash_cache["data"] is None:
        try:
            fetch_portfolio()
        except Exception:
            return None
    cash = _cash_cache.get("data")
    if not cash:
        return None
    try:
        gbpusd = _get_gbpusd_rate()
        free_gbp = cash["free_usd"] / gbpusd
        return {"free": free_gbp, "currency": "GBP"}
    except Exception:
        return None
