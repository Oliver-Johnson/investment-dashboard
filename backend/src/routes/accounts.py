from fastapi import APIRouter, HTTPException
from src.db import get_db
from src.models import Account, AccountCreate, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[Account])
def list_accounts():
    with next(get_db()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM accounts ORDER BY created_at")
            return cur.fetchall()


@router.post("", response_model=Account, status_code=201)
def create_account(body: AccountCreate):
    with next(get_db()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO accounts (name, account_type, colour)
                   VALUES (%(name)s, %(account_type)s, %(colour)s)
                   RETURNING *""",
                body.model_dump(),
            )
            return cur.fetchone()


@router.put("/{account_id}", response_model=Account)
def update_account(account_id: int, body: AccountUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = %({k})s" for k in updates)
    updates["id"] = account_id
    with next(get_db()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE accounts SET {set_clause} WHERE id = %(id)s RETURNING *",
                updates,
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Account not found")
            return row


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int):
    with next(get_db()) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM accounts WHERE id = %s RETURNING id", (account_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Account not found")
