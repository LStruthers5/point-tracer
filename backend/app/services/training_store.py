"""
Training-data store for segmentation corrections.

When a user (who has opted in) corrects the auto-detected segments of an
activity, the corrected boundaries + the GPS track are captured here as labeled
data to later retrain/evaluate the segmenter. One row per activity (upsert by
activity_key), so repeated edits to the same activity overwrite rather than pile
up.

Backed by the dual-mode db layer: Postgres in production, SQLite locally. Holds
personal GPS data — only ever written for users who explicitly opted in, and
gated behind a privacy policy.
"""

from __future__ import annotations

import time

from app.services.db import execute, fetch_one

_DDL = """
create table if not exists segmentation_corrections (
    activity_key text primary key,
    sport text,
    source_file text,
    payload_json text not null,
    created_at double precision not null,
    updated_at double precision not null
)
"""


def _ensure_table() -> None:
    execute(_DDL)


def save_correction(
    activity_key: str,
    sport: str,
    source_file: str,
    payload_json: str,
) -> None:
    _ensure_table()
    now = time.time()
    execute(
        """
        insert into segmentation_corrections (
            activity_key, sport, source_file, payload_json, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?)
        on conflict(activity_key) do update set
            sport = excluded.sport,
            source_file = excluded.source_file,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        """,
        (activity_key, sport, source_file, payload_json, now, now),
    )


def count_corrections() -> int:
    _ensure_table()
    row = fetch_one("select count(*) from segmentation_corrections")
    return int(row[0]) if row else 0
