from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from src.db import get_db

router = APIRouter(prefix="/api", tags=["notes"])


class NoteCreate(BaseModel):
    content: str
    colour: str = '#6366f1'
    account_ids: list[int] = []
    tag_names: list[str] = []


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    colour: Optional[str] = None
    account_ids: Optional[list[int]] = None
    tag_names: Optional[list[str]] = None


def _enrich_note(conn, note):
    """Attach account_ids and tag_names to a note dict."""
    with conn.cursor() as cur:
        cur.execute("SELECT account_id FROM note_accounts WHERE note_id = %s", (note["id"],))
        note["account_ids"] = [r["account_id"] for r in cur.fetchall()]
        cur.execute(
            "SELECT t.name FROM note_tags t JOIN note_tag_links l ON t.id = l.tag_id WHERE l.note_id = %s",
            (note["id"],),
        )
        note["tag_names"] = [r["name"] for r in cur.fetchall()]
    return note


def _set_account_links(cur, note_id, account_ids):
    cur.execute("DELETE FROM note_accounts WHERE note_id = %s", (note_id,))
    for aid in account_ids:
        cur.execute("INSERT INTO note_accounts (note_id, account_id) VALUES (%s, %s)", (note_id, aid))


def _set_tag_links(cur, note_id, tag_names):
    cur.execute("DELETE FROM note_tag_links WHERE note_id = %s", (note_id,))
    for name in tag_names:
        cur.execute(
            "INSERT INTO note_tags (name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
            (name,),
        )
        tag_id = cur.fetchone()["id"]
        cur.execute("INSERT INTO note_tag_links (note_id, tag_id) VALUES (%s, %s)", (note_id, tag_id))


@router.get("/notes")
def list_notes():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM notes ORDER BY updated_at DESC")
            notes = cur.fetchall()
        return [_enrich_note(conn, dict(n)) for n in notes]


@router.post("/notes", status_code=201)
def create_note(body: NoteCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO notes (content, colour) VALUES (%s, %s) RETURNING *",
                (body.content, body.colour),
            )
            note = dict(cur.fetchone())
            _set_account_links(cur, note["id"], body.account_ids)
            _set_tag_links(cur, note["id"], body.tag_names)
        return _enrich_note(conn, note)


@router.put("/notes/{note_id}")
def update_note(note_id: int, body: NoteUpdate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM notes WHERE id = %s", (note_id,))
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Note not found")

            updates = {}
            if body.content is not None:
                updates["content"] = body.content
            if body.colour is not None:
                updates["colour"] = body.colour

            if updates:
                set_clause = ", ".join(f"{k} = %({k})s" for k in updates)
                updates["id"] = note_id
                cur.execute(
                    f"UPDATE notes SET {set_clause}, updated_at = NOW() WHERE id = %(id)s RETURNING *",
                    updates,
                )
                note = dict(cur.fetchone())
            else:
                note = dict(existing)

            if body.account_ids is not None:
                _set_account_links(cur, note_id, body.account_ids)
            if body.tag_names is not None:
                _set_tag_links(cur, note_id, body.tag_names)

        return _enrich_note(conn, note)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM notes WHERE id = %s RETURNING id", (note_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Note not found")


@router.get("/tags")
def list_tags():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM note_tags ORDER BY name")
            return [r["name"] for r in cur.fetchall()]
