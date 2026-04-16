from datetime import date
from fastapi import APIRouter, HTTPException
from src.db import get_db
from src.models import DisposalCreate

router = APIRouter(prefix="/api/disposals", tags=["disposals"])


def _current_tax_year_bounds():
    today = date.today()
    if (today.month > 4) or (today.month == 4 and today.day >= 6):
        start_year = today.year
    else:
        start_year = today.year - 1
    return f"{start_year}-04-06", f"{start_year + 1}-04-05"


def _serialize(row: dict) -> dict:
    r = dict(row)
    r["sale_date"] = str(r["sale_date"])
    r["sale_price_gbp"] = float(r["sale_price_gbp"])
    r["cost_basis_gbp"] = float(r["cost_basis_gbp"]) if r.get("cost_basis_gbp") is not None else None
    r["quantity"] = float(r["quantity"])
    r["gain_loss_gbp"] = float(r["gain_loss_gbp"]) if r.get("gain_loss_gbp") is not None else None
    r["created_at"] = r["created_at"].isoformat() if r.get("created_at") else None
    return r


@router.get("")
def list_disposals(account_id: int = None):
    with get_db() as conn:
        with conn.cursor() as cur:
            if account_id is not None:
                cur.execute(
                    """SELECT *,
                       CASE WHEN cost_basis_gbp IS NOT NULL
                            THEN (sale_price_gbp - cost_basis_gbp) * quantity
                            ELSE NULL END AS gain_loss_gbp
                       FROM disposals WHERE account_id = %s ORDER BY sale_date DESC, created_at DESC""",
                    (account_id,),
                )
            else:
                cur.execute(
                    """SELECT *,
                       CASE WHEN cost_basis_gbp IS NOT NULL
                            THEN (sale_price_gbp - cost_basis_gbp) * quantity
                            ELSE NULL END AS gain_loss_gbp
                       FROM disposals ORDER BY sale_date DESC, created_at DESC"""
                )
            return [_serialize(row) for row in cur.fetchall()]


@router.get("/summary")
def disposal_summary():
    cur_start, cur_end = _current_tax_year_bounds()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COALESCE(SUM(
                    CASE WHEN cost_basis_gbp IS NOT NULL
                         THEN (sale_price_gbp - cost_basis_gbp) * quantity
                         ELSE 0 END
                ), 0) AS total
                FROM disposals
            """)
            total_gain_gbp = float(cur.fetchone()["total"])

            cur.execute("""
                SELECT COALESCE(SUM(
                    CASE WHEN cost_basis_gbp IS NOT NULL
                         THEN (sale_price_gbp - cost_basis_gbp) * quantity
                         ELSE 0 END
                ), 0) AS total
                FROM disposals WHERE sale_date BETWEEN %s AND %s
            """, (cur_start, cur_end))
            current_tax_year_gain_gbp = float(cur.fetchone()["total"])

            cur.execute("""
                SELECT account_id,
                    COALESCE(SUM(
                        CASE WHEN cost_basis_gbp IS NOT NULL
                             THEN (sale_price_gbp - cost_basis_gbp) * quantity
                             ELSE 0 END
                    ), 0) AS total_gain_gbp
                FROM disposals GROUP BY account_id
            """)
            by_account = [
                {"account_id": row["account_id"], "total_gain_gbp": float(row["total_gain_gbp"])}
                for row in cur.fetchall()
            ]

    return {
        "total_gain_gbp": total_gain_gbp,
        "current_tax_year_gain_gbp": current_tax_year_gain_gbp,
        "by_account": by_account,
    }


@router.post("", status_code=201)
def create_disposal(body: DisposalCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO disposals (account_id, ticker, display_name, quantity, sale_price_gbp, cost_basis_gbp, sale_date, notes)
                   VALUES (%(account_id)s, %(ticker)s, %(display_name)s, %(quantity)s, %(sale_price_gbp)s, %(cost_basis_gbp)s, %(sale_date)s, %(notes)s)
                   RETURNING *""",
                body.dict(),
            )
            row = dict(cur.fetchone())
            row["gain_loss_gbp"] = (
                (body.sale_price_gbp - body.cost_basis_gbp) * body.quantity
                if body.cost_basis_gbp is not None else None
            )
            return _serialize(row)


@router.delete("/{disposal_id}", status_code=204)
def delete_disposal(disposal_id: int):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM disposals WHERE id = %s RETURNING id", (disposal_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Disposal not found")
