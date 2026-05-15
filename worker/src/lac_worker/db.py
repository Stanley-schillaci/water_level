"""SQLite layer for the worker. All read/write operations on niveau_eau.db."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path


# --- Schema definitions -----------------------------------------------------

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS water_level (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_event DATE,
        datetime_event DATETIME,
        value REAL,
        unit TEXT,
        UNIQUE(datetime_event)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS threshold_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        value REAL NOT NULL,
        color TEXT NOT NULL DEFAULT '#1f77b4',
        dash_style TEXT NOT NULL DEFAULT 'dash',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_deleted INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS gpt_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT,
        prompt TEXT,
        response TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL DEFAULT 'tendance'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS empty_days (
        date_event DATE PRIMARY KEY,
        first_attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        attempts INTEGER NOT NULL DEFAULT 1
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_water_level_date_event ON water_level(date_event)",
]


# --- Connection helpers -----------------------------------------------------

@contextmanager
def connect(db_path: Path) -> Iterator[sqlite3.Connection]:
    """Yield a SQLite connection with row_factory=Row and WAL active."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: Path) -> None:
    """Create all tables, indexes, and activate WAL. Idempotent."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        for stmt in SCHEMA:
            conn.execute(stmt)


# --- water_level operations -------------------------------------------------


def _parse_datetime(date_str: str, hour_str: str) -> datetime:
    """Parse 'dd-mm-YYYY' + 'HH:MM' into a datetime."""
    return datetime.strptime(f"{date_str} {hour_str}", "%d-%m-%Y %H:%M")


def measure_exists(db_path: Path, date_str: str, hour_str: str) -> bool:
    dt_iso = _parse_datetime(date_str, hour_str).strftime("%Y-%m-%d %H:%M:%S")
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM water_level WHERE datetime_event = ?", (dt_iso,)
        ).fetchone()
    return row is not None


def add_measure(
    db_path: Path,
    date_str: str,
    hour_str: str,
    value: float,
    unit: str,
) -> bool:
    """Insert a measure. Returns True if inserted, False if duplicate."""
    if measure_exists(db_path, date_str, hour_str):
        return False
    dt = _parse_datetime(date_str, hour_str)
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO water_level (date_event, datetime_event, value, unit)
            VALUES (?, ?, ?, ?)
            """,
            (
                dt.strftime("%Y-%m-%d"),
                dt.strftime("%Y-%m-%d %H:%M:%S"),
                float(value),
                unit,
            ),
        )
    return True


# --- empty_days operations --------------------------------------------------


def upsert_empty_day(db_path: Path, iso_date: str) -> None:
    """Insert an empty day, or increment attempts if it already exists."""
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO empty_days (date_event, first_attempted_at, last_attempted_at, attempts)
            VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
            ON CONFLICT(date_event) DO UPDATE SET
                last_attempted_at = CURRENT_TIMESTAMP,
                attempts = attempts + 1
            """,
            (iso_date,),
        )


def delete_empty_day(db_path: Path, iso_date: str) -> None:
    """Remove an empty-day marker (no-op if absent)."""
    with connect(db_path) as conn:
        conn.execute("DELETE FROM empty_days WHERE date_event = ?", (iso_date,))


def list_empty_days(db_path: Path) -> list[str]:
    """Return all empty-day markers as ISO date strings."""
    with connect(db_path) as conn:
        rows = conn.execute("SELECT date_event FROM empty_days").fetchall()
    return [r["date_event"] for r in rows]
