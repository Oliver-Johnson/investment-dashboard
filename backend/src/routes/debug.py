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


@router.get("/etoro-instruments")
def debug_etoro_instruments():
    """Try multiple eToro instrument lookup methods and report which works."""
    try:
        port_resp = requests.get(
            f"{ETORO_BASE_URL}/api/v1/trading/info/portfolio",
            headers=_etoro_headers(), timeout=15
        )
        port_resp.raise_for_status()
        positions = port_resp.json().get("clientPortfolio", {}).get("positions", [])
        ids = [p["instrumentID"] for p in positions[:2] if p.get("instrumentID")]
    except Exception as e:
        return {"error": f"portfolio fetch failed: {e}"}

    results = {}

    # Try 1: market-data/instruments
    try:
        r = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/instruments",
            params={"instrumentIds": ",".join(str(i) for i in ids)},
            headers=_etoro_headers(), timeout=10
        )
        results["market-data/instruments"] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:200]}
    except Exception as e:
        results["market-data/instruments"] = {"error": str(e)}

    # Try 2: rates endpoint
    try:
        r = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/instruments/rates",
            params={"instrumentIds": ",".join(str(i) for i in ids)},
            headers=_etoro_headers(), timeout=10
        )
        results["market-data/rates"] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:200]}
    except Exception as e:
        results["market-data/rates"] = {"error": str(e)}

    # Try 3: search endpoint (with auth)
    try:
        r = requests.get(
            f"{ETORO_BASE_URL}/api/v1/market-data/search",
            params={"text": "Apple", "limit": 2},
            headers=_etoro_headers(), timeout=10
        )
        results["market-data/search"] = {"status": r.status_code, "body": r.json() if r.ok else r.text[:300]}
    except Exception as e:
        results["market-data/search"] = {"error": str(e)}

    # Try 4: feeds endpoint for first ID
    if ids:
        try:
            r = requests.get(
                f"{ETORO_BASE_URL}/api/v1/feeds/instrument/{ids[0]}",
                headers=_etoro_headers(), timeout=10
            )
            results[f"feeds/instrument/{ids[0]}"] = {"status": r.status_code, "body": str(r.json())[:300] if r.ok else r.text[:200]}
        except Exception as e:
            results[f"feeds/instrument/{ids[0]}"] = {"error": str(e)}

    return {"ids_queried": ids, "results": results}

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
