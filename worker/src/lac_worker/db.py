"""SQLite layer for the worker. All read/write operations on niveau_eau.db."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
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


# --- Missing-day computation ------------------------------------------------


def get_missing_days(
    db_path: Path,
    start_date: str,
    end_date: str | None = None,
) -> list[str]:
    """
    Return missing days (formatted dd-mm-YYYY) between start_date and end_date inclusive,
    excluding days already in water_level OR in empty_days.

    start_date / end_date: ISO 'YYYY-MM-DD'. If end_date is None, defaults to today.
    """
    if end_date is None:
        end_date = date.today().isoformat()

    query = """
    WITH RECURSIVE all_dates(d) AS (
      SELECT date(?)
      UNION ALL
      SELECT date(d, '+1 day') FROM all_dates WHERE d < date(?)
    )
    SELECT d FROM all_dates
    WHERE d NOT IN (SELECT DISTINCT date_event FROM water_level)
      AND d NOT IN (SELECT date_event FROM empty_days)
    ORDER BY d
    """
    with connect(db_path) as conn:
        rows = conn.execute(query, (start_date, end_date)).fetchall()
    return [
        datetime.strptime(r["d"], "%Y-%m-%d").strftime("%d-%m-%Y")
        for r in rows
    ]


# --- gpt_logs helpers -------------------------------------------------------


def log_gpt_call(
    db_path: Path,
    model: str,
    prompt: str,
    response: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    kind: str,
) -> None:
    """Persist an LLM call. `kind` is 'tendance' or 'comparaison_annuelle'."""
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO gpt_logs (
                model, prompt, response,
                prompt_tokens, completion_tokens, total_tokens,
                type
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (model, prompt, response, prompt_tokens, completion_tokens, total_tokens, kind),
        )


def get_last_gpt_response(db_path: Path, kind: str) -> str | None:
    """Return the most recent response of given kind, or None if no row matches."""
    with connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT response FROM gpt_logs
            WHERE type = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (kind,),
        ).fetchone()
    return row["response"] if row else None


# --- Read helpers for KPIs --------------------------------------------------


def load_all_measures(db_path: Path) -> list[dict]:
    """Return all water_level rows sorted by datetime_event ASC, as dicts."""
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT date_event, datetime_event, value, unit FROM water_level ORDER BY datetime_event"
        ).fetchall()
    return [dict(r) for r in rows]


def load_first_measure_per_day(db_path: Path) -> list[dict]:
    """Return one measure per day (the earliest of each date), as dicts."""
    query = """
    SELECT w.date_event, w.value
    FROM water_level w
    JOIN (
        SELECT date_event, MIN(datetime_event) AS min_dt
        FROM water_level
        GROUP BY date_event
    ) sub ON w.date_event = sub.date_event AND w.datetime_event = sub.min_dt
    ORDER BY w.date_event ASC
    """
    with connect(db_path) as conn:
        rows = conn.execute(query).fetchall()
    return [dict(r) for r in rows]
