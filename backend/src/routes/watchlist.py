from fastapi import APIRouter, HTTPException
from src.db import get_db
from src.models import WatchlistCreate
from src.providers.yfinance_client import get_price_gbp

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


def _serialize(row: dict) -> dict:
    r = dict(row)
    r["target_price_gbp"] = float(r["target_price_gbp"]) if r.get("target_price_gbp") is not None else None
    r["added_at"] = r["added_at"].isoformat() if r.get("added_at") else None
    return r


@router.get("")
def list_watchlist():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM watchlist ORDER BY added_at DESC")
            items = [_serialize(row) for row in cur.fetchall()]

    for item in items:
        try:
            item["current_price_gbp"] = get_price_gbp(item["ticker"])
            if item["target_price_gbp"] is not None and item["current_price_gbp"]:
                item["pct_to_target"] = (
                    (item["target_price_gbp"] - item["current_price_gbp"]) / item["current_price_gbp"]
                ) * 100
            else:
                item["pct_to_target"] = None
        except Exception:
            item["current_price_gbp"] = None
            item["pct_to_target"] = None

    return items


@router.post("", status_code=201)
def create_watchlist_item(body: WatchlistCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO watchlist (ticker, display_name, target_price_gbp, notes)
                   VALUES (%(ticker)s, %(display_name)s, %(target_price_gbp)s, %(notes)s)
                   RETURNING *""",
                body.dict(),
            )
            return _serialize(cur.fetchone())


@router.delete("/{item_id}", status_code=204)
def delete_watchlist_item(item_id: int):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM watchlist WHERE id = %s RETURNING id", (item_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Watchlist item not found")
