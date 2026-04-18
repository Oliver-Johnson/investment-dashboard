import base64
import logging
import os
import time
import requests
from decimal import Decimal
from src.providers.yfinance_client import _get_gbpusd_rate

# Credential sets: 'isa' and 'invest'
_T212_LIVE_URL = "https://live.trading212.com/api/v0"

_CREDS = {
    "isa": {
        "base_url": os.getenv("T212_BASE_URL", _T212_LIVE_URL),
        "api_key": os.getenv("T212_API_KEY", ""),
        "api_secret": os.getenv("T212_API_SECRET", ""),
    },
    "invest": {
        "base_url": os.getenv("T212_INVEST_BASE_URL", _T212_LIVE_URL),
        "api_key": os.getenv("T212_INVEST_API_KEY", ""),
        "api_secret": os.getenv("T212_INVEST_API_SECRET", ""),
    },
}

# Backwards-compat aliases
T212_BASE_URL = _CREDS["isa"]["base_url"]
T212_API_KEY = _CREDS["isa"]["api_key"]
T212_API_SECRET = _CREDS["isa"]["api_secret"]

# Per-account caches
_portfolio_cache: dict = {"isa": {"data": None, "expires": 0.0}, "invest": {"data": None, "expires": 0.0}}
_metadata_cache: dict = {"isa": {"data": None, "expires": 0.0}, "invest": {"data": None, "expires": 0.0}}
_pies_cache: dict = {"isa": {"data": None, "expires": 0.0}, "invest": {"data": None, "expires": 0.0}}


def _auth_header(account: str = "isa") -> dict:
    creds = _CREDS[account]
    token = base64.b64encode(f"{creds['api_key']}:{creds['api_secret']}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _instrument_metadata(account: str = "isa") -> dict:
    """Fetch T212 instrument metadata. Cached for 1 hour; returns stale data on failure
    rather than empty dict, so a transient API error doesn't permanently break GBX→GBP conversion."""
    cache = _metadata_cache[account]
    now = time.time()
    if cache["data"] is not None and now < cache["expires"]:
        return cache["data"]
    creds = _CREDS[account]
    if not creds["api_key"]:
        return cache["data"] or {}
    try:
        resp = requests.get(
            f"{creds['base_url']}/equity/metadata/instruments",
            headers=_auth_header(account),
            timeout=30,
        )
        resp.raise_for_status()
        result = {
            inst["ticker"]: {
                "currency": inst.get("currencyCode", "GBP"),
                "name": inst.get("name") or inst.get("fullName") or inst.get("shortName") or "",
            }
            for inst in resp.json()
        }
        cache["data"] = result
        cache["expires"] = now + 3600
        return result
    except Exception:
        return cache["data"] or {}


def _price_to_gbp(price: Decimal, currency: str, gbpusd_ref: list) -> Decimal:
    """Convert a price in `currency` to GBP. gbpusd_ref is a 1-element list used
    as a mutable cache so we only fetch GBPUSD once per portfolio call."""
    if currency == "GBP":
        return price
    if currency in ("GBX", "GBp"):
        # Pence → pounds (T212 uses GBX; some sources use GBp)
        return price / 100
    if currency == "USD":
        if not gbpusd_ref[0]:
            gbpusd_ref[0] = Decimal(str(_get_gbpusd_rate()))
        return price / gbpusd_ref[0]
    # Unknown currency — return as-is
    return price


def fetch_portfolio_cached(account: str = "isa") -> list[dict] | None:
    """Return cached portfolio data without blocking. Returns None if not ready yet."""
    cache = _portfolio_cache[account]
    if cache["data"] is not None:
        return cache["data"]
    if not cache.get("fetching"):
        cache["fetching"] = True
        import threading
        threading.Thread(target=_do_fetch_portfolio, args=(account,), daemon=True).start()
    return None


def _do_fetch_portfolio(account: str = "isa"):
    try:
        fetch_portfolio(account)
    finally:
        _portfolio_cache[account]["fetching"] = False


def fetch_portfolio(account: str = "isa") -> list[dict]:
    """Fetch T212 portfolio positions. Returns list of position dicts in GBP.
    Results are cached for 5 minutes to avoid slow repeated API calls."""
    creds = _CREDS[account]
    if not creds["api_key"]:
        return []

    cache = _portfolio_cache[account]
    now = time.time()
    if cache["data"] is not None and now < cache["expires"]:
        return cache["data"]

    headers = _auth_header(account)
    try:
        resp = requests.get(f"{creds['base_url']}/equity/portfolio", headers=headers, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"T212 API error: {e}") from e

    positions = resp.json()
    metadata = _instrument_metadata(account)
    pie_map = fetch_pies(account)
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
            # T212 variant tickers: SMSNl_EQ → try SMSN_EQ (strip trailing char before _EQ)
            import re as _re
            base = _re.sub(r'[0-9a-z](_EQ)$', r'\1', ticker)
            if base != ticker:
                ticker_meta = metadata.get(base, {})
        currency = ticker_meta.get("currency") or (
            "USD" if "_US_" in ticker
            else "GBX" if "GBX" in ticker.upper()
            else "GBP"
        )
        display_name = ticker_meta.get("name") or ticker

        current_price_gbp = _price_to_gbp(current_price, currency, gbpusd_ref)
        avg_price_gbp = _price_to_gbp(avg_price, currency, gbpusd_ref)
        market_value_gbp = quantity * current_price_gbp

        pie_info = pie_map.get(ticker)
        result = {
            "ticker": ticker,
            "display_name": display_name,
            "quantity": quantity,
            "avg_price": avg_price_gbp,
            "current_price_gbp": current_price_gbp,
            "market_value_gbp": market_value_gbp,
            "pie": {"id": pie_info["pieId"], "name": pie_info["pieName"]} if pie_info else None,
        }
        if ppl_gbp is not None:
            result["ppl_gbp"] = Decimal(str(ppl_gbp))
        results.append(result)

    _portfolio_cache[account]["data"] = results
    _portfolio_cache[account]["expires"] = time.time() + 300
    return results


def fetch_pies(account: str = "isa") -> dict:
    """Fetch T212 pies and return {ticker: {pieId, pieName}} map. Cached 5 min.
    Returns stale data (or {}) on API failure so callers degrade gracefully."""
    cache = _pies_cache[account]
    now = time.time()
    if cache["data"] is not None and now < cache["expires"]:
        return cache["data"]

    creds = _CREDS[account]
    if not creds["api_key"]:
        return {}

    headers = _auth_header(account)
    try:
        resp = requests.get(f"{creds['base_url']}/equity/pies", headers=headers, timeout=15)
        resp.raise_for_status()
    except requests.RequestException:
        return cache["data"] or {}

    pies = resp.json()
    ticker_map: dict = {}

    for pie in pies:
        pie_id = pie.get("id")
        time.sleep(1)  # Avoid T212 rate limiting (429) between pie detail requests

        detail = None
        for attempt in range(2):
            try:
                detail_resp = requests.get(
                    f"{creds['base_url']}/equity/pies/{pie_id}",
                    headers=headers,
                    timeout=15,
                )
                if detail_resp.status_code == 429:
                    if attempt == 0:
                        logging.warning("T212 pie %s: 429 rate limited, retrying after 2s", pie_id)
                        time.sleep(2)
                        continue
                    else:
                        logging.warning("T212 pie %s: 429 on retry, using instrumentShares fallback", pie_id)
                        break
                detail_resp.raise_for_status()
                detail = detail_resp.json()
                break
            except requests.RequestException as e:
                logging.warning("T212 pie %s: request failed (%s), using instrumentShares fallback", pie_id, e)
                break

        # Prefer name from detail endpoint (has settings.name); fall back to list-level fields
        pie_name = (
            ((detail.get("settings") or {}).get("name") if detail else None)
            or (pie.get("settings") or {}).get("name")
            or pie.get("name")
            or f"Pie {pie_id}"
        )

        instruments = (detail.get("instruments") or []) if detail else []

        # Instruments is normally a list of objects with a "ticker" key.
        # For copied/imported pies T212 sometimes returns an empty instruments list
        # but the list-level "instrumentShares" dict (ticker -> share%) is populated.
        if instruments:
            for inst in instruments:
                ticker = inst.get("ticker") or ""
                if ticker:
                    ticker_map[ticker] = {"pieId": pie_id, "pieName": pie_name}
        else:
            # Fall back to instrumentShares from the list-level pie object
            for ticker in (pie.get("instrumentShares") or {}):
                if ticker:
                    ticker_map[ticker] = {"pieId": pie_id, "pieName": pie_name}

    cache["data"] = ticker_map
    cache["expires"] = now + 300
    return ticker_map


def fetch_cash_balance(account: str = "isa") -> dict | None:
    """Return T212 cash balance: {free, currency}. Returns None on error."""
    creds = _CREDS[account]
    if not creds["api_key"]:
        return None
    try:
        resp = requests.get(f"{creds['base_url']}/equity/account/cash", headers=_auth_header(account), timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return {"free": float(data.get("free", 0)), "currency": data.get("currency", "GBP")}
    except Exception:
        return None
