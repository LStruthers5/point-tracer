"""
Group-session store for the multiplayer invite flow.

A "group session" is a shared, link-addressable replay that multiple athletes
contribute their own GPS data to. The store persists the latest combined session
JSON (the output of build_multiplayer_session_from_sources, or the single-player
seed before anyone has joined) keyed by a short URL-safe id.

Storage is a local SQLite file so invite links survive backend restarts. Records
auto-expire after EXPIRY_SECONDS so the store does not grow unbounded. This mirrors
the local-SQLite pattern already used for Strava tokens; for a large public launch,
move to a managed database.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
import time
from pathlib import Path

# Default next to the package; override with POINTTRACER_GROUP_DB_PATH in production
# (point it at a persistent disk on the host).
DEFAULT_DB_PATH = str(Path(__file__).resolve().parents[2] / "group_sessions.sqlite3")
EXPIRY_SECONDS = 30 * 24 * 60 * 60  # 30 days since last update
ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"  # no ambiguous 0/o/1/l
ID_LENGTH = 9


def _db_path() -> str:
    return os.environ.get("POINTTRACER_GROUP_DB_PATH", DEFAULT_DB_PATH)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS group_sessions (
            id TEXT PRIMARY KEY,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            sport TEXT NOT NULL,
            session_json TEXT NOT NULL
        )
        """
    )
    return conn


def _purge_expired(conn: sqlite3.Connection) -> None:
    cutoff = time.time() - EXPIRY_SECONDS
    conn.execute("DELETE FROM group_sessions WHERE updated_at < ?", (cutoff,))


def _new_id(conn: sqlite3.Connection) -> str:
    # Retry on the astronomically unlikely collision.
    for _ in range(10):
        candidate = "".join(secrets.choice(ID_ALPHABET) for _ in range(ID_LENGTH))
        exists = conn.execute(
            "SELECT 1 FROM group_sessions WHERE id = ?", (candidate,)
        ).fetchone()
        if not exists:
            return candidate
    raise RuntimeError("Could not allocate a unique group-session id.")


def create_group(session_json: str, sport: str) -> str:
    """Persist a seed session (single or multiplayer) and return its share id."""
    now = time.time()
    with _connect() as conn:
        _purge_expired(conn)
        group_id = _new_id(conn)
        conn.execute(
            "INSERT INTO group_sessions (id, created_at, updated_at, sport, session_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (group_id, now, now, sport, session_json),
        )
    return group_id


def get_group(group_id: str) -> dict | None:
    """Return {sport, session_json} for a live group, or None if missing/expired."""
    with _connect() as conn:
        _purge_expired(conn)
        row = conn.execute(
            "SELECT sport, session_json FROM group_sessions WHERE id = ?",
            (group_id,),
        ).fetchone()
    if not row:
        return None
    return {"sport": row[0], "session_json": row[1]}


def update_group(group_id: str, session_json: str) -> bool:
    """Replace a group's stored session JSON; returns False if it no longer exists."""
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE group_sessions SET session_json = ?, updated_at = ? WHERE id = ?",
            (session_json, time.time(), group_id),
        )
        return cursor.rowcount > 0
