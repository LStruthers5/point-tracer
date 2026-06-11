"""
Tiny dual-mode database layer.

- In production, set DATABASE_URL (Railway Postgres) → uses Postgres, which
  persists across redeploys with no volume to manage.
- With no DATABASE_URL (local dev) → falls back to a single local SQLite file,
  so local development needs zero setup.

Stores write SQL with `?` placeholders (SQLite style); they are translated to
`%s` for Postgres. The DDL uses types valid in both engines. psycopg is only
imported when DATABASE_URL is set, so local dev doesn't need it installed.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

_raw_url = os.environ.get("DATABASE_URL", "").strip()
# psycopg wants the postgresql:// scheme; Railway sometimes hands out postgres://.
DATABASE_URL = _raw_url.replace("postgres://", "postgresql://", 1) if _raw_url else ""
USE_POSTGRES = bool(DATABASE_URL)


def _sqlite_path() -> str:
    configured = os.environ.get("POINTTRACER_DB_PATH")
    if configured:
        return configured
    return str(Path(__file__).resolve().parents[2] / ".local" / "pointtracer.sqlite3")


def translate(sql: str) -> str:
    """Translate `?` placeholders to `%s` when running on Postgres."""
    return sql.replace("?", "%s") if USE_POSTGRES else sql


@contextmanager
def get_conn() -> Iterator[Any]:
    if USE_POSTGRES:
        import psycopg  # imported lazily so local dev doesn't need it

        conn = psycopg.connect(DATABASE_URL)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    else:
        path = _sqlite_path()
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def execute(sql: str, params: tuple = ()) -> None:
    """Run a write/DDL statement."""
    with get_conn() as conn:
        conn.cursor().execute(translate(sql), params)


def fetch_one(sql: str, params: tuple = ()) -> tuple | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(translate(sql), params)
        return cursor.fetchone()
