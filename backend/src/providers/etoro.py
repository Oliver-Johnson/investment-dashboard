import logging
import os
import time
import threading
import uuid
import requests
from decimal import Decimal
from src.providers.yfinance_client import _get_gbpusd_rate, _get_rate_to_gbp

# 5-minute portfolio cache to avoid slow repeated eToro API calls
_portfolio_cache: dict = {"data": None, "expires": 0.0}
_cash_cache: dict = {"data": None, "expires": 0.0}
_live_pnl_cache: dict = {"data": None, "expires": 0.0}

# Instrument data cache — only populated when a non-empty result is obtained,
# so failed fetches don't permanently block retries (unlike lru_cache which caches {}).
_instrument_data_cache: dict | None = None
_instrument_data_lock = threading.Lock()

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


def _fetch_live_pnl() -> dict:
    """Fetch live P&L data from eToro. Returns {positionID: {"netProfit": float, "currentRate": float, "currency": str}}.
    Cached for 60 seconds."""
    now = time.time()
    if _live_pnl_cache["data"] is not None and now < _live_pnl_cache["expires"]:
        return _live_pnl_cache["data"]

    result = {}
    endpoints = [
        f"{ETORO_BASE_URL}/api/v1/trading/info/real/pnl",
        f"{ETORO_BASE_URL}/api/v1/trading/info/pnl",
    ]
    for url in endpoints:
        try:
            logging.info("etoro _fetch_live_pnl: trying %s", url)
            resp = requests.get(url, headers=_auth_headers(), timeout=15)
            logging.info("etoro _fetch_live_pnl: %s -> %d", url, resp.status_code)
            if resp.status_code >= 400:
                logging.info("etoro _fetch_live_pnl: body=%s", resp.text[:500])
                continue
            resp.raise_for_status()
            data = resp.json()
            logging.info("etoro _fetch_live_pnl: response keys=%s, type=%s", list(data.keys()) if isinstance(data, dict) else "list", type(data).__name__)
            # Handle both list and dict response formats
            positions = data if isinstance(data, list) else data.get("positions", data.get("items", []))
            if isinstance(positions, dict):
                # Could be a dict keyed by positionID
                for pid_str, pdata in positions.items():
                    try:
                        pid = int(pid_str)
                    except (ValueError, TypeError):
                        continue
                    result[pid] = {
                        "netProfit": pdata.get("netProfit", 0),
                        "currentRate": pdata.get("currentRate", 0),
                        "currency": pdata.get("currency", "USD"),
                    }
            elif isinstance(positions, list):
                for pos in positions:
                    pid = pos.get("positionID") or pos.get("positionId")
                    if pid:
                        result[int(pid)] = {
                            "netProfit": pos.get("netProfit", 0),
                            "currentRate": pos.get("currentRate", 0),
                            "currency": pos.get("currency", "USD"),
                        }
            if result:
                logging.info("etoro _fetch_live_pnl: got %d positions from %s", len(result), url)
                break
            else:
                logging.info("etoro _fetch_live_pnl: parsed 0 positions from %s, sample: %s",
                             url, str(data)[:300])
        except Exception as e:
            logging.info("etoro _fetch_live_pnl: %s failed: %s", url, e)
            continue

    _live_pnl_cache["data"] = result
    _live_pnl_cache["expires"] = time.time() + 60
    return result


def _all_instrument_data() -> dict:
    """Fetch ALL eToro instrument metadata. Returns {instrumentId: {"name": str, "ticker": str|None}}.

    Primary: private market-data/instruments endpoint.
    Fallback: market-data/search with large pageSize.

    Uses a module-level cache that is only populated on success so that API
    failures don't permanently block retries (unlike lru_cache which would
    cache the empty {} result forever).
    """
    global _instrument_data_cache
    if _instrument_data_cache is not None:
        return _instrument_data_cache
    with _instrument_data_lock:
        if _instrument_data_cache is not None:  # double-check after acquiring lock
            return _instrument_data_cache
        result = _fetch_all_instrument_data()
        if result:
            _instrument_data_cache = result
        return result


def _fetch_all_instrument_data() -> dict:
    """Internal: perform the actual API calls. Called by _all_instrument_data()."""
    def _extract(inst: dict, fallback_id) -> dict:
        name = (
            inst.get("displayname")
            or inst.get("internalInstrumentDisplayName")
            or inst.get("displayName")
            or inst.get("internalSymbolFull")
            or f"eToro #{fallback_id}"
        )
        raw_ticker = inst.get("symbolFull") or inst.get("internalSymbolFull")
        ticker = raw_ticker.upper() if raw_ticker else None
        return {"name": name, "ticker": ticker}

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
            result = {
                int(inst["instrumentId"]): _extract(inst, inst["instrumentId"])
                for inst in instruments
                if inst.get("instrumentId")
            }
            if result:
                return result
    except Exception:
        pass

    # Fallback: paginate search endpoint — returns all instruments with display names.
    # Fetch page 1 to discover totalItems, then fetch remaining pages in parallel.
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _fetch_page(page: int) -> list:
            r = requests.get(
                f"{ETORO_BASE_URL}/api/v1/market-data/search",
                params={"text": "", "page": page, "pageSize": 500},
                headers=_auth_headers(),
                timeout=30,
            )
            r.raise_for_status()
            return r.json().get("items", [])

        # Page 1 to learn total count
        first_resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/search",
            params={"text": "", "page": 1, "pageSize": 500},
            headers=_auth_headers(), timeout=30,
        )
        first_resp.raise_for_status()
        first_body = first_resp.json()
        first_items = first_body.get("items", [])
        total = first_body.get("totalItems", 0)
        # API ignores pageSize and may return fewer than requested — detect actual page size
        actual_page_size = max(len(first_items), 1) if first_items else 20
        total_pages = max(1, -(-total // actual_page_size))  # ceiling division

        all_items: list = list(first_items)

        # Fetch remaining pages concurrently
        if total_pages > 1:
            with ThreadPoolExecutor(max_workers=8) as ex:
                futures = {ex.submit(_fetch_page, p): p for p in range(2, total_pages + 1)}
                for fut in as_completed(futures):
                    try:
                        all_items.extend(fut.result())
                    except Exception:
                        pass

        # Portfolio positions use instrumentID (numeric int); search results expose this
        # as either "instrumentId" or "internalInstrumentId" — normalise to int to avoid
        # str/int key mismatches during lookup.
        return {
            int(inst.get("instrumentId") or inst.get("internalInstrumentId")): _extract(
                inst, inst.get("instrumentId") or inst.get("internalInstrumentId")
            )
            for inst in all_items
            if (inst.get("instrumentId") or inst.get("internalInstrumentId"))
        }
    except Exception:
        return {}


def _fetch_instruments_by_ids(instrument_ids: list[int], headers: dict) -> dict:
    """Fetch instrument metadata for specific IDs via POST /api/v2/instruments.

    Batches up to 50 IDs per request. Returns {instrument_id: {"name": str, "ticker": str|None}}.
    Returns empty dict on any failure — caller should fall back to _all_instrument_data().
    """
    def _extract(inst: dict, fallback_id) -> dict:
        name = (
            inst.get("internalInstrumentDisplayName")
            or inst.get("displayname")
            or inst.get("displayName")
            or inst.get("internalSymbolFull")
            or f"eToro #{fallback_id}"
        )
        raw_ticker = inst.get("internalSymbolFull") or inst.get("symbolFull")
        ticker = raw_ticker.upper() if raw_ticker else None
        return {"name": name, "ticker": ticker}

    result: dict = {}
    logging.info("etoro _fetch_instruments_by_ids: requesting %d IDs: %s", len(instrument_ids), instrument_ids)
    try:
        for i in range(0, len(instrument_ids), 50):
            batch = instrument_ids[i:i + 50]
            resp = requests.post(
                "https://api.etoro.com/api/v2/instruments",
                json={"instrumentIds": batch},
                headers=headers,
                timeout=15,
            )
            logging.info("etoro POST /api/v2/instruments: status=%d batch=%s", resp.status_code, batch)
            resp.raise_for_status()
            items = resp.json().get("items", [])
            resolved_ids = [inst.get("instrumentId") or inst.get("internalInstrumentId") for inst in items]
            logging.info("etoro POST /api/v2/instruments: returned %d items, resolved IDs=%s", len(items), resolved_ids)
            for inst in items:
                inst_id = inst.get("instrumentId") or inst.get("internalInstrumentId")
                if inst_id:
                    result[int(inst_id)] = _extract(inst, inst_id)
    except Exception as e:
        logging.info("etoro POST /api/v2/instruments FAILED: %s", e)
        return {}
    return result


def _resolve_missing_instruments(missing_ids: list[int], headers: dict) -> dict:
    """Try multiple fallback endpoints to resolve instrument names for IDs that failed batch lookup.
    Returns {instrument_id: {"name": str, "ticker": str|None}}."""
    def _extract(inst: dict, fallback_id) -> dict:
        name = (
            inst.get("internalInstrumentDisplayName")
            or inst.get("displayname")
            or inst.get("displayName")
            or inst.get("instrumentDisplayName")
            or inst.get("name")
            or inst.get("internalSymbolFull")
            or inst.get("symbolFull")
            or f"eToro #{fallback_id}"
        )
        raw_ticker = inst.get("internalSymbolFull") or inst.get("symbolFull") or inst.get("symbol")
        ticker = raw_ticker.upper() if raw_ticker else None
        return {"name": name, "ticker": ticker}

    result: dict = {}

    # Strategy 1: Individual GET /api/v1/market-data/instruments/{id}
    for iid in missing_ids:
        if iid in result:
            continue
        try:
            url = f"{ETORO_BASE_URL}/api/v1/market-data/instruments/{iid}"
            logging.info("etoro _resolve_missing: trying GET %s", url)
            resp = requests.get(url, headers=headers, timeout=10)
            logging.info("etoro _resolve_missing: GET instruments/%d -> %d", iid, resp.status_code)
            if resp.status_code < 400:
                data = resp.json()
                if isinstance(data, list) and data:
                    data = data[0]
                if isinstance(data, dict) and (data.get("instrumentId") or data.get("name") or data.get("displayName")):
                    result[iid] = _extract(data, iid)
                    logging.info("etoro _resolve_missing: resolved %d via individual GET: %s", iid, result[iid])
        except Exception as e:
            logging.info("etoro _resolve_missing: GET instruments/%d failed: %s", iid, e)

    still_missing = [iid for iid in missing_ids if iid not in result]
    if not still_missing:
        return result

    # Strategy 2: Public eToro web API
    try:
        ids_param = ",".join(str(i) for i in still_missing)
        url = f"https://www.etoro.com/api/instrumentsmetadata/V1.1/instruments?instrumentIds={ids_param}"
        logging.info("etoro _resolve_missing: trying public web API: %s", url)
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        logging.info("etoro _resolve_missing: public web API -> %d", resp.status_code)
        if resp.status_code < 400:
            data = resp.json()
            items = data if isinstance(data, list) else data.get("instruments", data.get("items", []))
            if isinstance(items, list):
                for inst in items:
                    inst_id = inst.get("instrumentId") or inst.get("InstrumentId")
                    if inst_id and int(inst_id) in still_missing:
                        result[int(inst_id)] = _extract(inst, inst_id)
                        logging.info("etoro _resolve_missing: resolved %d via public API: %s", int(inst_id), result[int(inst_id)])
    except Exception as e:
        logging.info("etoro _resolve_missing: public web API failed: %s", e)

    still_missing = [iid for iid in missing_ids if iid not in result]
    if not still_missing:
        return result

    # Strategy 3: POST to api.etoro.com (different base URL from public-api.etoro.com)
    try:
        logging.info("etoro _resolve_missing: trying POST api.etoro.com for %s", still_missing)
        resp = requests.post(
            "https://api.etoro.com/api/v2/instruments",
            json={"instrumentIds": still_missing},
            headers=headers,
            timeout=15,
        )
        logging.info("etoro _resolve_missing: POST api.etoro.com -> %d", resp.status_code)
        if resp.status_code < 400:
            items = resp.json().get("items", [])
            for inst in items:
                inst_id = inst.get("instrumentId") or inst.get("internalInstrumentId")
                if inst_id and int(inst_id) in still_missing:
                    result[int(inst_id)] = _extract(inst, inst_id)
    except Exception as e:
        logging.info("etoro _resolve_missing: POST api.etoro.com failed: %s", e)

    return result


def _all_instrument_names() -> dict:
    """Returns {instrumentId: display_name}. Delegates to _all_instrument_data cache."""
    return {k: v["name"] for k, v in _all_instrument_data().items()}


def _all_instrument_tickers() -> dict:
    """Returns {instrumentId: ticker_symbol}. Delegates to _all_instrument_data cache."""
    return {k: v["ticker"] for k, v in _all_instrument_data().items() if v.get("ticker")}


def _instrument_names(instrument_ids_tuple: tuple) -> dict:
    """Look up names from the cached map. Non-blocking: returns eToro #ID if cache not ready."""
    if _instrument_data_cache is not None:
        all_names = _all_instrument_names()
    else:
        # Cache not ready — trigger background fetch and return IDs for now
        threading.Thread(target=_all_instrument_data, daemon=True).start()
        all_names = {}

    if not instrument_ids_tuple:
        return all_names
    return {iid: all_names.get(iid, f"eToro #{iid}") for iid in instrument_ids_tuple}


def _instrument_tickers(instrument_ids_tuple: tuple) -> dict:
    """Look up ticker symbols from the cached map. Non-blocking: returns None if cache not ready."""
    if _instrument_data_cache is not None:
        all_tickers = _all_instrument_tickers()
    else:
        all_tickers = {}

    if not instrument_ids_tuple:
        return all_tickers
    return {iid: all_tickers.get(iid) for iid in instrument_ids_tuple}


def fetch_portfolio_cached() -> list[dict] | None:
    """Return cached portfolio data without blocking. Returns None if not ready yet."""
    if _portfolio_cache["data"] is not None:
        return _portfolio_cache["data"]
    if not _portfolio_cache.get("fetching"):
        _portfolio_cache["fetching"] = True
        threading.Thread(target=_do_fetch_portfolio, daemon=True).start()
    return None


def _do_fetch_portfolio():
    try:
        fetch_portfolio()
    finally:
        _portfolio_cache["fetching"] = False


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

    # Fetch live P&L data and merge into positions (portfolio endpoint lacks netProfit/currentRate)
    live_pnl = _fetch_live_pnl()
    if live_pnl:
        logging.info("etoro: merging live P&L for %d positions", len(live_pnl))
        for pos in positions:
            pid = pos.get("positionID") or pos.get("positionId")
            if pid and int(pid) in live_pnl:
                pnl = live_pnl[int(pid)]
                if pnl.get("netProfit") is not None and "netProfit" not in pos:
                    pos["netProfit"] = pnl["netProfit"]
                if pnl.get("currentRate") and not pos.get("currentRate"):
                    pos["currentRate"] = pnl["currentRate"]
                if pnl.get("currency") and not pos.get("currency"):
                    pos["currency"] = pnl["currency"]
        for mirror in mirrors:
            for pos in mirror.get("positions", []):
                pid = pos.get("positionID") or pos.get("positionId")
                if pid and int(pid) in live_pnl:
                    pnl = live_pnl[int(pid)]
                    if pnl.get("netProfit") is not None and "netProfit" not in pos:
                        pos["netProfit"] = pnl["netProfit"]
                    if pnl.get("currentRate") and not pos.get("currentRate"):
                        pos["currentRate"] = pnl["currentRate"]
                    if pnl.get("currency") and not pos.get("currency"):
                        pos["currency"] = pnl["currency"]
    else:
        logging.info("etoro: no live P&L data available, using portfolio data as-is")

    # Collect ALL instrument IDs (direct + mirror positions) before fetching names.
    # Normalise to int to avoid str/int key mismatches between API responses.
    all_instrument_ids = {int(pos["instrumentID"]) for pos in positions if pos.get("instrumentID")}
    for mirror in mirrors:
        for pos in mirror.get("positions", []):
            if pos.get("instrumentID"):
                all_instrument_ids.add(int(pos["instrumentID"]))

    instrument_ids = tuple(sorted(all_instrument_ids))
    # Targeted batch POST for only the IDs present in this portfolio.
    # Falls back to the bulk fetch if the POST endpoint fails or returns empty.
    inst_headers = _auth_headers()
    all_data = _fetch_instruments_by_ids(list(instrument_ids), inst_headers)
    if not all_data:
        all_data = _all_instrument_data()
    else:
        # Merge results into the shared cache (only on non-empty result)
        global _instrument_data_cache
        with _instrument_data_lock:
            if _instrument_data_cache is None:
                _instrument_data_cache = dict(all_data)
            else:
                _instrument_data_cache.update(all_data)

    names = {iid: all_data[iid]["name"] for iid in instrument_ids if iid in all_data}
    tickers = {iid: all_data[iid]["ticker"] for iid in instrument_ids if iid in all_data and all_data[iid].get("ticker")}

    resolved_ids = [iid for iid in instrument_ids if iid in all_data and not all_data[iid]["name"].startswith("eToro #")]
    missing_ids = [iid for iid in instrument_ids if iid not in all_data or all_data[iid]["name"].startswith("eToro #")]
    logging.info("etoro instruments: requested=%s resolved=%s missing=%s", list(instrument_ids), resolved_ids, missing_ids)

    # Try fallback resolution for any missing instruments
    if missing_ids:
        fallback_data = _resolve_missing_instruments(missing_ids, inst_headers)
        if fallback_data:
            logging.info("etoro: fallback resolved %d/%d missing instruments", len(fallback_data), len(missing_ids))
            all_data.update(fallback_data)
            with _instrument_data_lock:
                _instrument_data_cache.update(fallback_data)
            # Rebuild names/tickers with newly resolved data
            names = {iid: all_data[iid]["name"] for iid in instrument_ids if iid in all_data}
            tickers = {iid: all_data[iid]["ticker"] for iid in instrument_ids if iid in all_data and all_data[iid].get("ticker")}

    gbpusd = Decimal(str(_get_gbpusd_rate()))
    logging.debug("eToro fetch_portfolio: gbpusd=%.4f", float(gbpusd))
    results = []

    def _pos_to_gbp(pos_currency: str) -> Decimal:
        """Return conversion rate: 1 unit of pos_currency → GBP."""
        c = (pos_currency or "USD").upper()
        if not c or c == "USD":
            return Decimal("1") / gbpusd
        if c == "GBP":
            return Decimal("1")
        return Decimal(str(_get_rate_to_gbp(c)))

    for pos in positions:
        instrument_id = int(pos.get("instrumentID", 0))
        units = Decimal(str(pos.get("units", 0)))
        invested = Decimal(str(
            pos.get("amount")
            or pos.get("unitsBaseValueDollars", 0)
            or 0
        ))

        # Use explicit key-presence check so that netProfit=0.0 is preserved.
        if "netProfit" in pos:
            raw_profit = pos["netProfit"]
        elif "profit" in pos:
            raw_profit = pos["profit"]
        elif "pnl" in pos:
            raw_profit = pos["pnl"]
        else:
            raw_profit = None
        profit = Decimal(str(raw_profit)) if raw_profit is not None else Decimal("0")

        current_value = invested + profit
        price_native = (current_value / units) if units else Decimal("0")

        # Determine what currency amount/netProfit are reported in.
        # eToro typically reports in account base currency (USD), but some positions
        # carry a `currency` field indicating native instrument currency instead.
        pos_currency = (pos.get("currency") or "USD").upper()
        to_gbp = _pos_to_gbp(pos_currency)
        logging.debug("eToro pos instrumentID=%s currency=%s to_gbp=%.6f", instrument_id, pos_currency, float(to_gbp))

        market_value_gbp = current_value * to_gbp
        current_price_gbp = price_native * to_gbp

        open_rate = Decimal(str(pos.get("openRate") or 0))
        current_rate_native = Decimal(str(pos.get("currentRate") or 0))
        avg_price_gbp = None
        if open_rate > 0:
            if pos_currency != "USD" and current_rate_native > 0:
                # Rates are in the same currency as amounts — use direct conversion.
                avg_price_gbp = open_rate * to_gbp
            elif current_rate_native > 0 and current_price_gbp > 0:
                # USD amounts: use price ratio to infer native→GBP conversion.
                avg_price_gbp = open_rate * (current_price_gbp / current_rate_native)
            else:
                avg_price_gbp = open_rate * to_gbp

        net_profit_gbp = (profit * to_gbp) if raw_profit is not None else None

        display_name = names.get(instrument_id) or f"eToro #{instrument_id}"
        ticker = tickers.get(instrument_id) or str(instrument_id)
        name_resolved = instrument_id in names and not display_name.startswith("eToro #")
        logging.info(
            "etoro pos %s: currency=%s invested=%s netProfit=%s currentRate=%s name_resolved=%s calc_profit_gbp=%s",
            instrument_id, pos_currency, float(invested), float(profit),
            pos.get("currentRate"), name_resolved,
            float(net_profit_gbp) if net_profit_gbp is not None else None,
        )

        results.append({
            "ticker": ticker,
            "display_name": display_name,
            "quantity": units,
            "currency": "GBP",
            "current_price_gbp": current_price_gbp,
            "market_value_gbp": market_value_gbp,
            "avg_price_gbp": avg_price_gbp,
            "net_profit_gbp": net_profit_gbp,
        })

    # Also include copytrade (mirror) positions — same currency-aware P&L fix.
    for mirror in mirrors:
        mirror_name = mirror.get("parentUsername", "Copy Trade")
        for pos in mirror.get("positions", []):
            instrument_id = int(pos.get("instrumentID", 0))
            units = Decimal(str(pos.get("units", 0)))
            invested = Decimal(str(pos.get("amount") or pos.get("unitsBaseValueDollars", 0) or 0))

            if "netProfit" in pos:
                raw_profit = pos["netProfit"]
            elif "profit" in pos:
                raw_profit = pos["profit"]
            elif "pnl" in pos:
                raw_profit = pos["pnl"]
            else:
                raw_profit = None
            profit = Decimal(str(raw_profit)) if raw_profit is not None else Decimal("0")

            current_value = invested + profit
            price_native = (current_value / units) if units else Decimal("0")

            pos_currency = (pos.get("currency") or "USD").upper()
            to_gbp = _pos_to_gbp(pos_currency)

            market_value_gbp = current_value * to_gbp
            current_price_gbp = price_native * to_gbp

            open_rate = Decimal(str(pos.get("openRate") or 0))
            current_rate_native = Decimal(str(pos.get("currentRate") or 0))
            avg_price_gbp = None
            if open_rate > 0:
                if pos_currency != "USD" and current_rate_native > 0:
                    avg_price_gbp = open_rate * to_gbp
                elif current_rate_native > 0 and current_price_gbp > 0:
                    avg_price_gbp = open_rate * (current_price_gbp / current_rate_native)
                else:
                    avg_price_gbp = open_rate * to_gbp

            net_profit_gbp = (profit * to_gbp) if raw_profit is not None else None
            display_name = names.get(instrument_id) or f"eToro #{instrument_id}"
            results.append({
                "ticker": tickers.get(instrument_id) or str(instrument_id),
                "display_name": f"{display_name} (via {mirror_name})",
                "quantity": units,
                "currency": "GBP",
                "current_price_gbp": current_price_gbp,
                "market_value_gbp": market_value_gbp,
                "avg_price_gbp": avg_price_gbp,
                "net_profit_gbp": net_profit_gbp,
            })

    # Don't cache if instrument data failed to load — names will be fallbacks.
    # Next request will retry instrument resolution.
    if all_data:
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
