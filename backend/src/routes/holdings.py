from fastapi import APIRouter, HTTPException
from src.db import get_db
from src.models import Holding, HoldingCreate, HoldingUpdate

router = APIRouter(prefix="/api/portfolio/holdings", tags=["holdings"])


@router.get("", response_model=list[Holding])
def list_holdings():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM holdings ORDER BY provider, ticker")
            return [dict(row) for row in cur.fetchall()]


@router.post("", response_model=Holding, status_code=201)
def create_holding(body: HoldingCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO holdings (provider, ticker, display_name, unit_count, currency, notes)
                   VALUES (%(provider)s, %(ticker)s, %(display_name)s, %(unit_count)s, %(currency)s, %(notes)s)
                   RETURNING *""",
                body.model_dump()
            )
            return dict(cur.fetchone())


@router.put("/{holding_id}", response_model=Holding)
def update_holding(holding_id: int, body: HoldingUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = %({k})s" for k in updates)
    set_clause += ", last_holding_update = NOW()"

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE holdings SET {set_clause} WHERE id = %(id)s RETURNING *",
                {**updates, "id": holding_id}
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Holding not found")
            return dict(row)


@router.delete("/{holding_id}", status_code=204)
def delete_holding(holding_id: int):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM holdings WHERE id = %s RETURNING id", (holding_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Holding not found")
