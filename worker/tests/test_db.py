from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from lac_worker.db import init_db


def _tables(db_path: Path) -> set[str]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    return {r[0] for r in rows}


def _indexes(db_path: Path) -> set[str]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
        ).fetchall()
    return {r[0] for r in rows}


def test_init_db_creates_all_tables(tmp_db: Path) -> None:
    init_db(tmp_db)

    assert _tables(tmp_db) >= {"water_level", "threshold_line", "gpt_logs", "empty_days"}


def test_init_db_creates_water_level_date_index(tmp_db: Path) -> None:
    init_db(tmp_db)

    assert "idx_water_level_date_event" in _indexes(tmp_db)


def test_init_db_activates_wal_mode(tmp_db: Path) -> None:
    init_db(tmp_db)

    with sqlite3.connect(tmp_db) as conn:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert mode == "wal"


def test_init_db_is_idempotent(tmp_db: Path) -> None:
    init_db(tmp_db)
    init_db(tmp_db)  # second call should not raise

    assert _tables(tmp_db) >= {"water_level", "threshold_line", "gpt_logs", "empty_days"}
