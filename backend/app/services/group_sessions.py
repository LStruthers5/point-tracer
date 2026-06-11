"""
Group-session store for the multiplayer invite flow.

A "group session" is a shared, link-addressable replay that multiple athletes
contribute their own GPS data to. The store persists the latest combined session
JSON (the output of build_multiplayer_session_from_sources, or the single-player
seed before anyone has joined) keyed by a short URL-safe id.

Backed by the dual-mode db layer: Postgres in production (persists across
redeploys), SQLite locally. Records auto-expire after EXPIRY_SECONDS.
"""

from __future__ import annotations

import secrets
import time

from app.services.db import execute, fetch_one, get_conn, translate

EXPIRY_SECONDS = 30 * 24 * 60 * 60  # 30 days since last update
ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"  # no ambiguous 0/o/1/l
ID_LENGTH = 9

_DDL = """
create table if not exists group_sessions (
    id text primary key,
    created_at double precision not null,
    updated_at double precision not null,
    sport text not null,
    session_json text not null
)
"""


def _ensure_table() -> None:
    execute(_DDL)


def _purge_expired() -> None:
    execute(
        "delete from group_sessions where updated_at < ?",
        (time.time() - EXPIRY_SECONDS,),
    )


def _new_id() -> str:
    for _ in range(10):
        candidate = "".join(secrets.choice(ID_ALPHABET) for _ in range(ID_LENGTH))
        if not fetch_one("select 1 from group_sessions where id = ?", (candidate,)):
            return candidate
    raise RuntimeError("Could not allocate a unique group-session id.")


def create_group(session_json: str, sport: str) -> str:
    """Persist a seed session (single or multiplayer) and return its share id."""
    _ensure_table()
    _purge_expired()
    group_id = _new_id()
    now = time.time()
    execute(
        "insert into group_sessions (id, created_at, updated_at, sport, session_json) "
        "values (?, ?, ?, ?, ?)",
        (group_id, now, now, sport, session_json),
    )
    return group_id


def get_group(group_id: str) -> dict | None:
    """Return {sport, session_json} for a live group, or None if missing/expired."""
    _ensure_table()
    _purge_expired()
    row = fetch_one(
        "select sport, session_json from group_sessions where id = ?",
        (group_id,),
    )
    if not row:
        return None
    return {"sport": row[0], "session_json": row[1]}


def update_group(group_id: str, session_json: str) -> bool:
    """Replace a group's stored session JSON; returns False if it no longer exists."""
    _ensure_table()
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            translate("update group_sessions set session_json = ?, updated_at = ? where id = ?"),
            (session_json, time.time(), group_id),
        )
        return cursor.rowcount > 0
