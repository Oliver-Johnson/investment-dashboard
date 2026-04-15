from fastapi import APIRouter, HTTPException
from src.db import get_db
from src.models import ContributionCreate

router = APIRouter(prefix="/api/contributions", tags=["contributions"])


def _current_tax_year_bounds():
    """Return (start, end) date strings for current UK tax year (6 Apr – 5 Apr)."""
    from datetime import date
    today = date.today()
    if (today.month > 4) or (today.month == 4 and today.day >= 6):
        start_year = today.year
    else:
        start_year = today.year - 1
    return f"{start_year}-04-06", f"{start_year + 1}-04-05"


def _last_tax_year_bounds():
    start, end = _current_tax_year_bounds()
    sy = int(start[:4]) - 1
    return f"{sy}-04-06", f"{sy + 1}-04-05"


def _serialize(row: dict) -> dict:
    r = dict(row)
    r["date"] = str(r["date"])
    r["amount_gbp"] = float(r["amount_gbp"])
    r["created_at"] = r["created_at"].isoformat() if r.get("created_at") else None
    return r


@router.get("")
def list_contributions(account_id: int = None):
    with get_db() as conn:
        with conn.cursor() as cur:
            if account_id is not None:
                cur.execute(
                    "SELECT * FROM contributions WHERE account_id = %s ORDER BY date DESC, created_at DESC",
                    (account_id,),
                )
            else:
                cur.execute("SELECT * FROM contributions ORDER BY date DESC, created_at DESC")
            return [_serialize(row) for row in cur.fetchall()]


@router.get("/summary")
def contribution_summary():
    cur_start, cur_end = _current_tax_year_bounds()
    last_start, last_end = _last_tax_year_bounds()

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(SUM(amount_gbp), 0) AS total FROM contributions")
            total_gbp = float(cur.fetchone()["total"])

            cur.execute("""
                SELECT account_id, SUM(amount_gbp) AS total_gbp, COUNT(*) AS count
                FROM contributions
                GROUP BY account_id
            """)
            by_account = [
                {"account_id": row["account_id"], "total_gbp": float(row["total_gbp"]), "count": row["count"]}
                for row in cur.fetchall()
            ]

            cur.execute(
                "SELECT COALESCE(SUM(amount_gbp), 0) AS total FROM contributions WHERE date BETWEEN %s AND %s",
                (cur_start, cur_end),
            )
            current_tax_year_gbp = float(cur.fetchone()["total"])

            cur.execute(
                "SELECT COALESCE(SUM(amount_gbp), 0) AS total FROM contributions WHERE date BETWEEN %s AND %s",
                (last_start, last_end),
            )
            last_tax_year_gbp = float(cur.fetchone()["total"])

    return {
        "total_gbp": total_gbp,
        "by_account": by_account,
        "current_tax_year_gbp": current_tax_year_gbp,
        "last_tax_year_gbp": last_tax_year_gbp,
    }


@router.post("", status_code=201)
def create_contribution(body: ContributionCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO contributions (account_id, amount_gbp, date, notes)
                   VALUES (%(account_id)s, %(amount_gbp)s, %(date)s, %(notes)s)
                   RETURNING *""",
                body.dict(),
            )
            return _serialize(cur.fetchone())


@router.delete("/{contribution_id}", status_code=204)
def delete_contribution(contribution_id: int):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM contributions WHERE id = %s RETURNING id", (contribution_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Contribution not found")
