import os
import uuid
import requests
import base64
from fastapi import APIRouter

router = APIRouter(prefix="/api/debug", tags=["debug"])

ETORO_BASE_URL = "https://public-api.etoro.com"
ETORO_API_KEY = os.getenv("ETORO_API_KEY", "")
ETORO_USER_KEY = os.getenv("ETORO_USER_KEY", "") or os.getenv("ETORO_USERNAME", "")


def _etoro_headers():
    return {
        "x-request-id": str(uuid.uuid4()),
        "x-api-key": ETORO_USER_KEY,
        "x-user-key": ETORO_API_KEY,
    }


@router.get("/etoro-portfolio-keys")
def debug_etoro_portfolio_keys():
    """Show all top-level keys in clientPortfolio response (excluding large arrays)."""
    try:
        resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/trading/info/portfolio",
            headers=_etoro_headers(), timeout=20
        )
        resp.raise_for_status()
        data = resp.json()
        cp = data.get("clientPortfolio", {})
        summary = {k: v for k, v in cp.items() if k not in ("positions", "mirrors")}
        return {"clientPortfolio_keys": summary, "top_level_keys": list(data.keys())}
    except Exception as e:
        return {"error": str(e)}


@router.get("/etoro-balances")
def debug_etoro_balances():
    """Probe eToro endpoints that may contain multi-currency balances."""
    results = {}
    endpoints = [
        "/api/v1/trading/info/account",
        "/api/v1/accounts/balance",
        "/api/v1/accounts/wallets",
        "/api/v1/trading/info/balances",
        "/api/v1/trading/info/wallet",
        "/api/v1/user/info",
        "/api/v1/accounts/info",
        "/api/v1/trading/financials",
    ]
    for path in endpoints:
        try:
            r = requests.get(f"{ETORO_BASE_URL}{path}", headers=_etoro_headers(), timeout=10)
            results[path] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:200]}
        except Exception as e:
            results[path] = {"error": str(e)}
    return results


@router.get("/etoro-instruments")
def debug_etoro_instruments():
    """Try multiple eToro instrument lookup methods and report which works."""
    try:
        port_resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/trading/info/portfolio",
            headers=_etoro_headers(), timeout=15
        )
        port_resp.raise_for_status()
        portfolio = port_resp.json().get("clientPortfolio", {})
        positions = portfolio.get("positions", [])
        ids = [p["instrumentID"] for p in positions[:2] if p.get("instrumentID")]
        # Show raw fields of first position to see if name data is embedded
        raw_first_position = {k: v for k, v in (positions[0].items() if positions else {}.items())}
    except Exception as e:
        return {"error": f"portfolio fetch failed: {e}"}

    results = {}
    results["raw_first_position"] = raw_first_position

    # Try 1: market-data/instruments (private API — returns 500 for individual keys)
    try:
        r = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/instruments",
            params={"instrumentIds": ",".join(str(i) for i in ids)},
            headers=_etoro_headers(), timeout=10
        )
        results["market-data/instruments"] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:200]}
    except Exception as e:
        results["market-data/instruments"] = {"error": str(e)}

    # Try 2: eToro public web API (no auth required — used by etoro.com frontend)
    try:
        r = requests.get(
            "https://www.etoro.com/api/instruments/v1.1/instruments",
            params={"InstrumentIds": ",".join(str(i) for i in ids), "fields": "InstrumentDisplayName,SymbolFull"},
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=10
        )
        results["etoro-web-public-instruments"] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:300]}
    except Exception as e:
        results["etoro-web-public-instruments"] = {"error": str(e)}

    # Try 3: eToro public rates API (no auth — tradable rates)
    try:
        r = requests.get(
            "https://www.etoro.com/sapi/trade-data-real/live/public/tradables/rates",
            params={"InstrumentIds": ",".join(str(i) for i in ids)},
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=10
        )
        results["etoro-web-public-rates"] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:300]}
    except Exception as e:
        results["etoro-web-public-rates"] = {"error": str(e)}

    # Try 4: eToro CDN metadata
    try:
        r = requests.get(
            f"https://api.etorocdn.com/instruments/{ids[0] if ids else 0}",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=10
        )
        results["etoro-cdn-instrument"] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:300]}
    except Exception as e:
        results["etoro-cdn-instrument"] = {"error": str(e)}

    return {"ids_queried": ids, "results": results}

@router.get("/etoro-positions-raw")
def etoro_positions_raw():
    """Show raw eToro position data to inspect field names and values."""
    from src.providers import etoro
    positions = etoro.fetch_portfolio_cached()
    if positions is None:
        # Not cached yet — trigger a blocking fetch
        try:
            positions = etoro.fetch_portfolio()
        except Exception as e:
            return {"error": str(e)}
    if not positions:
        return {"error": "No positions cached yet"}
    # Return first 3 positions with all their fields
    return positions[:3]


@router.get("/etoro-search-raw")
def etoro_search_raw():
    """Show raw eToro search API response to see exact field names used for instrument names."""
    import os, uuid, requests
    ETORO_BASE_URL = "https://public-api.etoro.com"
    headers = {
        "x-request-id": str(uuid.uuid4()),
        "x-api-key": os.getenv("ETORO_USER_KEY", "") or os.getenv("ETORO_USERNAME", ""),
        "x-user-key": os.getenv("ETORO_API_KEY", ""),
    }
    try:
        r = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/search",
            params={"text": "", "page": 1, "pageSize": 500},
            headers=headers, timeout=30
        )
        r.raise_for_status()
        body = r.json()
        items = body.get("items", [])
        return {
            "totalItems": body.get("totalItems"),
            "items_returned": len(items),
            "first_item_all_keys": items[0] if items else {},
            "first_3_items": items[:3],
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/etoro-positions-raw-api")
def etoro_positions_raw_api():
    """Show RAW eToro API position objects (before normalization) to inspect field names."""
    try:
        resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/trading/info/portfolio",
            headers=_etoro_headers(), timeout=20
        )
        resp.raise_for_status()
        data = resp.json()
        cp = data.get("clientPortfolio", {})
        positions = cp.get("positions", [])
        return {"positions_raw": positions[:3], "all_keys_in_first": list(positions[0].keys()) if positions else []}
    except Exception as e:
        return {"error": str(e)}


@router.get("/etoro-portfolio")
def debug_etoro_portfolio():
    """Diagnostic: raw positions, instrument data, gbpusd rate, and P&L calculation trace."""
    from src.providers import etoro as etoro_module
    from src.providers.yfinance_client import _get_gbpusd_rate, _get_rate_to_gbp

    # Fetch raw portfolio from eToro API
    try:
        resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/trading/info/portfolio",
            headers=_etoro_headers(), timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return {"error": f"portfolio fetch failed: {e}"}

    cp = data.get("clientPortfolio", {})
    positions = cp.get("positions", [])
    first5 = positions[:5]
    instrument_ids = [int(p["instrumentID"]) for p in first5 if p.get("instrumentID")]

    # Try POST /api/v2/instruments for those IDs
    post_result = {}
    try:
        post_resp = requests.post(
            "https://api.etoro.com/api/v2/instruments",
            json={"instrumentIds": instrument_ids},
            headers=_etoro_headers(), timeout=15,
        )
        post_result = {
            "status": post_resp.status_code,
            "body": post_resp.json() if post_resp.ok else post_resp.text[:500],
        }
    except Exception as e:
        post_result = {"error": str(e)}

    # gbpusd rate
    try:
        gbpusd = _get_gbpusd_rate()
    except Exception as e:
        gbpusd = f"error: {e}"

    # Per-position summary with name resolution status from cache
    cached_data = etoro_module._instrument_data_cache or {}
    positions_summary = []
    for p in first5:
        iid = int(p.get("instrumentID", 0))
        inst_info = cached_data.get(iid, {})
        resolved_name = inst_info.get("name", "")
        positions_summary.append({
            "instrumentID": iid,
            "currency": p.get("currency"),
            "amount": p.get("amount"),
            "netProfit": p.get("netProfit"),
            "currentRate": p.get("currentRate"),
            "openRate": p.get("openRate"),
            "units": p.get("units"),
            "name_from_cache": resolved_name or None,
            "ticker_from_cache": inst_info.get("ticker"),
            "name_resolved": bool(resolved_name and not resolved_name.startswith("eToro #")),
        })

    # P&L calculation trace for first non-GBP position
    pnl_trace = None
    for p in first5:
        pos_currency = (p.get("currency") or "USD").upper()
        if pos_currency == "GBP":
            continue
        iid = int(p.get("instrumentID", 0))
        try:
            if pos_currency == "USD":
                to_gbp = 1.0 / gbpusd if isinstance(gbpusd, (int, float)) else None
            else:
                to_gbp = _get_rate_to_gbp(pos_currency)
            invested = float(p.get("amount") or 0)
            net_profit = float(p.get("netProfit") or 0)
            pnl_trace = {
                "instrumentID": iid,
                "pos_currency": pos_currency,
                "gbpusd_rate": gbpusd,
                "to_gbp_rate": to_gbp,
                "invested_native": invested,
                "netProfit_native": net_profit,
                "pnl_gbp_calc": net_profit * to_gbp if to_gbp else None,
                "market_value_gbp_calc": (invested + net_profit) * to_gbp if to_gbp else None,
            }
        except Exception as e:
            pnl_trace = {"error": str(e), "instrumentID": iid, "currency": pos_currency}
        break

    return {
        "first_5_positions_raw": first5,
        "positions_summary": positions_summary,
        "instrument_ids_from_first_5": instrument_ids,
        "post_instruments_result": post_result,
        "gbpusd_rate": gbpusd,
        "instrument_cache_populated": etoro_module._instrument_data_cache is not None,
        "instrument_cache_size": len(etoro_module._instrument_data_cache) if etoro_module._instrument_data_cache else 0,
        "cached_data_for_these_ids": {str(iid): cached_data.get(iid) for iid in instrument_ids},
        "pnl_trace_first_non_gbp": pnl_trace,
    }


@router.get("/etoro-name-lookup")
def etoro_name_lookup():
    """Show first 10 entries from the cached instrument names map."""
    from src.providers.etoro import _all_instrument_names
    cache_info = _all_instrument_names.cache_info()
    if cache_info.currsize == 0:
        return {"status": "cache_not_populated", "note": "Call /api/debug/etoro-positions-raw first to warm cache"}
    names = _all_instrument_names()
    first_10 = dict(list(names.items())[:10])
    return {"total_entries": len(names), "first_10": first_10, "sample_key_types": str(type(list(names.keys())[0])) if names else "empty"}


T212_BASE_URL = os.getenv("T212_BASE_URL", "https://demo.trading212.com/api/v0")
T212_API_KEY = os.getenv("T212_API_KEY", "")
T212_API_SECRET = os.getenv("T212_API_SECRET", "")


@router.get("/t212")
def debug_t212():
    """Return first 3 raw T212 positions for debugging."""
    if not T212_API_KEY:
        return {"error": "T212_API_KEY not set"}
    token = base64.b64encode(f"{T212_API_KEY}:{T212_API_SECRET}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}
    try:
        resp = requests.get(f"{T212_BASE_URL}/equity/portfolio", headers=headers, timeout=10)
        resp.raise_for_status()
        positions = resp.json()
        return {"positions": positions[:3]}
    except requests.RequestException as e:
        return {"error": str(e)}


@router.get("/t212-pies")
def debug_t212_pies():
    """Return raw T212 pies list + per-pie detail for debugging copied/imported pies."""
    import logging
    from src.providers.t212 import _CREDS, _auth_header

    logger = logging.getLogger(__name__)

    creds = _CREDS["isa"]
    if not creds["api_key"]:
        return {"error": "T212_API_KEY not set"}

    headers = _auth_header("isa")
    base_url = creds["base_url"]

    # Fetch the pie list
    try:
        list_resp = requests.get(f"{base_url}/equity/pies", headers=headers, timeout=15)
        list_resp.raise_for_status()
        pies_list = list_resp.json()
    except requests.RequestException as e:
        return {"error": f"Failed to fetch /equity/pies: {e}"}

    logger.info("T212 /equity/pies raw response: %s", pies_list)

    # Fetch detail for each pie
    pie_details = []
    for pie in pies_list:
        pie_id = pie.get("id")
        try:
            detail_resp = requests.get(
                f"{base_url}/equity/pies/{pie_id}",
                headers=headers,
                timeout=15,
            )
            detail_resp.raise_for_status()
            detail = detail_resp.json()
        except requests.RequestException as e:
            detail = {"error": str(e)}

        logger.info("T212 /equity/pies/%s raw response: %s", pie_id, detail)
        pie_details.append({
            "list_entry": pie,
            "detail": detail,
            "instruments_count": len(detail.get("instruments", [])) if isinstance(detail.get("instruments"), list)
                else len(detail.get("instruments", {})) if isinstance(detail.get("instruments"), dict)
                else 0,
        })

    return {
        "total_pies": len(pies_list),
        "pies": pie_details,
    }
