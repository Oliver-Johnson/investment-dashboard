from fastapi import APIRouter
from src.db import get_db

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


def _serialize(row: dict) -> dict:
    r = dict(row)
    r["snapshot_date"] = str(r["snapshot_date"])
    r["value_gbp"] = float(r["value_gbp"])
    return r


def _do_capture() -> dict:
    from src.routes.portfolio import portfolio_summary
    summary = portfolio_summary()
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
                """SELECT * FROM portfolio_snapshots
                   WHERE account_id IS NULL
                   AND snapshot_date >= CURRENT_DATE - INTERVAL '%s days'
                   ORDER BY snapshot_date ASC""",
                (days,),
            )
            return [_serialize(row) for row in cur.fetchall()]


@router.get("/accounts")
def list_account_snapshots(days: int = 90):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT * FROM portfolio_snapshots
                   WHERE account_id IS NOT NULL
                   AND snapshot_date >= CURRENT_DATE - INTERVAL '%s days'
                   ORDER BY snapshot_date ASC""",
                (days,),
            )
            return [_serialize(row) for row in cur.fetchall()]


@router.post("/run")
def run_snapshot():
    """Trigger a snapshot manually or via the daily scheduler."""
    return _do_capture()
