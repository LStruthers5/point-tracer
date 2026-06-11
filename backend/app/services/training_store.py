"""
Training-data store for segmentation corrections.

When a user (who has opted in) corrects the auto-detected segments of an
activity, the corrected boundaries + the GPS track are captured here as labeled
data to later retrain/evaluate the segmenter. One row per activity (upsert by
activity_key), so repeated edits to the same activity overwrite rather than pile
up.

Storage is local SQLite on the persistent volume, mirroring the other stores.
This holds personal GPS data — only ever written for users who explicitly
opted in, and gated behind a privacy policy.
"""

from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path

DEFAULT_DB_PATH = str(
    Path(__file__).resolve().parents[2] / ".local" / "training_corrections.sqlite3"
)


def _db_path() -> str:
    return os.environ.get("POINTTRACER_TRAINING_DB_PATH", DEFAULT_DB_PATH)


def _connect() -> sqlite3.Connection:
    path = Path(_db_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute(
        """
        create table if not exists segmentation_corrections (
            activity_key text primary key,
            sport text,
            source_file text,
            payload_json text not null,
            created_at real not null,
            updated_at real not null
        )
        """
    )
    return conn


def save_correction(
    activity_key: str,
    sport: str,
    source_file: str,
    payload_json: str,
) -> None:
    now = time.time()
    with _connect() as conn:
        conn.execute(
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
    with _connect() as conn:
        row = conn.execute("select count(*) from segmentation_corrections").fetchone()
    return int(row[0]) if row else 0
