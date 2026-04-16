from datetime import datetime, timezone
from fastapi import APIRouter
from src.db import get_db
from src.providers import status as provider_status
from src.providers.yfinance_client import _gbpusd_cache, CACHE_TTL_MINUTES

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def get_health():
    last_snapshot_date = None
    hours_since_snapshot = None
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT MAX(snapshot_date) AS d FROM portfolio_snapshots WHERE account_id IS NULL"
                )
                row = cur.fetchone()
                if row and row["d"]:
                    last_snapshot_date = str(row["d"])
                    snap_dt = datetime.combine(row["d"], datetime.min.time()).replace(tzinfo=timezone.utc)
                    hours_since_snapshot = round((datetime.now(timezone.utc) - snap_dt).total_seconds() / 3600, 2)
    except Exception:
        pass

    gbpusd_rate = None
    gbpusd_age_s = None
    try:
        cached = _gbpusd_cache.get("rate")
        if cached:
            gbpusd_rate = cached["value"]
            gbpusd_age_s = round((datetime.utcnow() - cached["fetched"]).total_seconds(), 1)
    except Exception:
        pass

    providers = None
    try:
        providers = provider_status.snapshot()
    except Exception:
        pass

    return {
        "last_snapshot_date": last_snapshot_date,
        "hours_since_snapshot": hours_since_snapshot,
        "gbpusd_rate": gbpusd_rate,
        "gbpusd_age_s": gbpusd_age_s,
        "price_cache_max_age_s": CACHE_TTL_MINUTES * 60,
        "providers": providers,
    }
