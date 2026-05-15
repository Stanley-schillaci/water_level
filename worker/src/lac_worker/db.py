"""SQLite layer for the worker. All read/write operations on niveau_eau.db."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
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
