from fastapi import APIRouter
from src.db import get_db

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


def _serialize(row: dict) -> dict:
    r = dict(row)
    r["snapshot_date"] = str(r["snapshot_date"])
    r["value_gbp"] = float(r["value_gbp"])
    return r


def _do_capture(precomputed_summary=None) -> dict:
    from src.routes.portfolio import portfolio_summary
    summary = precomputed_summary if precomputed_summary is not None else portfolio_summary()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO portfolio_snapshots (account_id, snapshot_date, value_gbp)
                   VALUES (NULL, CURRENT_DATE, %s)
                   ON CONFLICT (COALESCE(account_id, -1), snapshot_date)
                   DO UPDATE SET value_gbp = EXCLUDED.value_gbp""",
                (summary.total_value_gbp,),
            )
            for acc in summary.accounts:
                cur.execute(
                    """INSERT INTO portfolio_snapshots (account_id, snapshot_date, value_gbp)
                       VALUES (%s, CURRENT_DATE, %s)
                       ON CONFLICT (COALESCE(account_id, -1), snapshot_date)
                       DO UPDATE SET value_gbp = EXCLUDED.value_gbp""",
                    (acc.id, acc.total_value_gbp),
                )
    return {"captured": len(summary.accounts) + 1}


@router.get("")
def list_snapshots(days: int = 90):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT * FROM portfolio_snapshots
                   WHERE account_id IS NULL
                   AND snapshot_date >= CURRENT_DATE - INTERVAL '{int(days)} days'
                   ORDER BY snapshot_date ASC"""
            )
            return [_serialize(row) for row in cur.fetchall()]


@router.get("/accounts")
def list_account_snapshots(days: int = 90):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT * FROM portfolio_snapshots
                   WHERE account_id IS NOT NULL
                   AND snapshot_date >= CURRENT_DATE - INTERVAL '{int(days)} days'
                   ORDER BY snapshot_date ASC"""
            )
            return [_serialize(row) for row in cur.fetchall()]


@router.post("/run")
def run_snapshot():
    """Trigger a snapshot manually. Waits for all provider caches to warm up before capturing."""
    from src.scheduler import _wait_for_warmup, _provider_error_within
    import logging
    logger = logging.getLogger(__name__)

    # Force a fresh fetch from both providers before waiting
    from src.providers import t212, etoro
    from src.db import get_db as _get_db
    try:
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT account_type FROM accounts")
                account_types = {r["account_type"] for r in cur.fetchall()}
    except Exception:
        account_types = set()

    if "t212" in account_types or "t212_invest" in account_types:
        try:
            t212.fetch_portfolio("isa")
            if t212._CREDS.get("invest", {}).get("api_key"):
                t212.fetch_portfolio("invest")
        except Exception as e:
            logger.warning("T212 fetch failed during manual snapshot: %s", e)

    if "etoro" in account_types:
        try:
            etoro.fetch_portfolio()
        except Exception as e:
            logger.warning("eToro fetch failed during manual snapshot: %s", e)

    # Wait up to 120s for all provider caches to populate
    still_loading = _wait_for_warmup(timeout=120, poll_interval=2)
    if still_loading:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=f"Provider(s) still loading after 120s: {still_loading}. Snapshot not taken.",
        )

    bad_provider = _provider_error_within(minutes=10)
    if bad_provider:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=f"Provider '{bad_provider}' had an error in the last 10 minutes. Snapshot not taken.",
        )

    return _do_capture()
