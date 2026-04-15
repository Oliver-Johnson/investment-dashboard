from fastapi import APIRouter, HTTPException
from src.db import get_db
from src.models import HoldingCreate, HoldingUpdate

router = APIRouter(prefix="/api/holdings", tags=["holdings"])


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
def create_holding(body: HoldingCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO holdings (account_id, ticker, display_name, unit_count, currency, notes, manual_price_gbp)
                   VALUES (%(account_id)s, %(ticker)s, %(display_name)s, %(unit_count)s, %(currency)s, %(notes)s, %(manual_price_gbp)s)
                   RETURNING *""",
                body.model_dump(),
            )
            return cur.fetchone()


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
