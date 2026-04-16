import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException

from src.db import get_db
from src.models import HoldingCreate, HoldingUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/holdings", tags=["holdings"])


def _auto_name_holding(holding_id: int, ticker: str) -> None:
    try:
        from src.services.name_backfill import _fetch_name, _normalize_ticker

        yf_sym = _normalize_ticker(ticker)
        if not yf_sym:
            return
        name = _fetch_name(yf_sym)
        if name:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE holdings SET display_name = %s WHERE id = %s AND (display_name IS NULL OR display_name = '')",
                        (name, holding_id),
                    )
            logger.info("auto-named holding %s → %s", ticker, name)
    except Exception as exc:
        logger.warning("auto-name for holding %s failed: %s", ticker, exc)


@router.get("")
def list_holdings(account_id: int = None):
    with get_db() as conn:
        with conn.cursor() as cur:
            if account_id is not None:
                cur.execute(
                    "SELECT * FROM holdings WHERE account_id = %s ORDER BY ticker",
                    (account_id,),
                )
            else:
                cur.execute("SELECT * FROM holdings ORDER BY account_id, ticker")
            return cur.fetchall()


@router.post("", status_code=201)
def create_holding(body: HoldingCreate, background_tasks: BackgroundTasks):
    data = body.model_dump()
    data["ticker"] = data["ticker"].lower()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO holdings (account_id, ticker, display_name, unit_count, currency, notes, manual_price_gbp, avg_cost_gbp)
                   VALUES (%(account_id)s, %(ticker)s, %(display_name)s, %(unit_count)s, %(currency)s, %(notes)s, %(manual_price_gbp)s, %(avg_cost_gbp)s)
                   ON CONFLICT (account_id, lower(ticker)) DO UPDATE SET
                       unit_count = EXCLUDED.unit_count,
                       display_name = EXCLUDED.display_name,
                       notes = EXCLUDED.notes,
                       manual_price_gbp = EXCLUDED.manual_price_gbp,
                       avg_cost_gbp = EXCLUDED.avg_cost_gbp,
                       last_holding_update = NOW()
                   RETURNING *""",
                data,
            )
            row = cur.fetchone()

    if row and not row.get("display_name"):
        background_tasks.add_task(_auto_name_holding, row["id"], row["ticker"])

    return row


@router.put("/{holding_id}")
def update_holding(holding_id: int, body: HoldingUpdate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE holdings
                   SET unit_count = %(unit_count)s,
                       display_name = COALESCE(%(display_name)s, display_name),
                       notes = COALESCE(%(notes)s, notes),
                       manual_price_gbp = %(manual_price_gbp)s,
                       avg_cost_gbp = %(avg_cost_gbp)s,
                       last_holding_update = NOW()
                   WHERE id = %(id)s
                   RETURNING *""",
                {**body.model_dump(), "id": holding_id},
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Holding not found")
            return row


@router.delete("/{holding_id}", status_code=204)
def delete_holding(holding_id: int):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM holdings WHERE id = %s RETURNING id", (holding_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Holding not found")
