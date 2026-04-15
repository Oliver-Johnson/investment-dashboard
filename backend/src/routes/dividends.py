from fastapi import APIRouter, HTTPException
from src.db import get_db
from src.models import DividendCreate

router = APIRouter(prefix="/api/dividends", tags=["dividends"])


@router.get("")
def list_dividends(account_id: int = None):
    with get_db() as conn:
        with conn.cursor() as cur:
            if account_id is not None:
                cur.execute(
                    "SELECT * FROM dividends WHERE account_id = %s ORDER BY pay_date DESC NULLS LAST, created_at DESC",
                    (account_id,),
                )
            else:
                cur.execute("SELECT * FROM dividends ORDER BY pay_date DESC NULLS LAST, created_at DESC")
            return cur.fetchall()


@router.get("/summary")
def dividend_summary():
    """Returns total dividends grouped by account and overall."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    account_id,
                    SUM(amount_gbp) AS total_gbp,
                    COUNT(*) AS payment_count,
                    MIN(pay_date) AS first_payment,
                    MAX(pay_date) AS last_payment
                FROM dividends
                GROUP BY account_id
            """)
            by_account = cur.fetchall()
            cur.execute("SELECT COALESCE(SUM(amount_gbp), 0) AS total FROM dividends")
            total = cur.fetchone()
            return {"total_gbp": float(total["total"]), "by_account": by_account}


@router.post("", status_code=201)
def create_dividend(body: DividendCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO dividends (account_id, ticker, display_name, amount_gbp, ex_date, pay_date, notes)
                   VALUES (%(account_id)s, %(ticker)s, %(display_name)s, %(amount_gbp)s, %(ex_date)s, %(pay_date)s, %(notes)s)
                   RETURNING *""",
                body.model_dump(),
            )
            return cur.fetchone()


@router.delete("/{dividend_id}", status_code=204)
def delete_dividend(dividend_id: int):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dividends WHERE id = %s RETURNING id", (dividend_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Dividend not found")
