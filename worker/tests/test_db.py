from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

import pytest

from lac_worker.db import (
    add_measure,
    delete_empty_day,
    get_missing_days,
    init_db,
    list_empty_days,
    measure_exists,
    upsert_empty_day,
)


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


# --- Task 5: add_measure + measure_exists -----------------------------------


def test_add_measure_inserts_new_row(empty_initialized_db, tmp_db: Path) -> None:
    inserted = add_measure(tmp_db, "10-09-2024", "14:20", 665.9, "mNGF")

    assert inserted is True
    row = empty_initialized_db.execute(
        "SELECT date_event, datetime_event, value, unit FROM water_level"
    ).fetchone()
    assert row["date_event"] == "2024-09-10"
    assert row["datetime_event"] == "2024-09-10 14:20:00"
    assert row["value"] == 665.9
    assert row["unit"] == "mNGF"


def test_add_measure_returns_false_when_duplicate(empty_initialized_db, tmp_db: Path) -> None:
    add_measure(tmp_db, "10-09-2024", "14:20", 665.9, "mNGF")
    second = add_measure(tmp_db, "10-09-2024", "14:20", 665.9, "mNGF")

    assert second is False
    count = empty_initialized_db.execute("SELECT COUNT(*) FROM water_level").fetchone()[0]
    assert count == 1


def test_measure_exists_returns_true_when_present(empty_initialized_db, tmp_db: Path) -> None:
    add_measure(tmp_db, "10-09-2024", "14:20", 665.9, "mNGF")

    assert measure_exists(tmp_db, "10-09-2024", "14:20") is True


def test_measure_exists_returns_false_when_absent(tmp_db: Path) -> None:
    init_db(tmp_db)

    assert measure_exists(tmp_db, "10-09-2024", "14:20") is False


# --- Task 6: empty_days CRUD ------------------------------------------------


def test_upsert_empty_day_inserts_new(empty_initialized_db, tmp_db: Path) -> None:
    upsert_empty_day(tmp_db, "2021-09-04")

    row = empty_initialized_db.execute(
        "SELECT date_event, attempts FROM empty_days"
    ).fetchone()
    assert row["date_event"] == "2021-09-04"
    assert row["attempts"] == 1


def test_upsert_empty_day_increments_attempts_on_duplicate(empty_initialized_db, tmp_db: Path) -> None:
    upsert_empty_day(tmp_db, "2021-09-04")
    upsert_empty_day(tmp_db, "2021-09-04")
    upsert_empty_day(tmp_db, "2021-09-04")

    row = empty_initialized_db.execute(
        "SELECT attempts FROM empty_days WHERE date_event = ?",
        ("2021-09-04",),
    ).fetchone()
    assert row["attempts"] == 3


def test_delete_empty_day_removes_row(empty_initialized_db, tmp_db: Path) -> None:
    upsert_empty_day(tmp_db, "2021-09-04")

    delete_empty_day(tmp_db, "2021-09-04")

    count = empty_initialized_db.execute("SELECT COUNT(*) FROM empty_days").fetchone()[0]
    assert count == 0


def test_delete_empty_day_no_op_when_absent(tmp_db: Path) -> None:
    init_db(tmp_db)

    # Should not raise
    delete_empty_day(tmp_db, "2021-09-04")


def test_list_empty_days_returns_iso_date_strings(empty_initialized_db, tmp_db: Path) -> None:
    upsert_empty_day(tmp_db, "2021-09-04")
    upsert_empty_day(tmp_db, "2022-10-19")

    result = list_empty_days(tmp_db)

    assert set(result) == {"2021-09-04", "2022-10-19"}


# --- Task 7: get_missing_days -----------------------------------------------


def test_get_missing_days_returns_all_dates_when_db_empty(tmp_db: Path) -> None:
    init_db(tmp_db)

    result = get_missing_days(tmp_db, start_date="2024-01-01", end_date="2024-01-03")

    # 3 days, all missing
    assert result == ["01-01-2024", "02-01-2024", "03-01-2024"]


def test_get_missing_days_excludes_days_with_measures(tmp_db: Path) -> None:
    init_db(tmp_db)
    add_measure(tmp_db, "02-01-2024", "10:00", 665.0, "mNGF")

    result = get_missing_days(tmp_db, start_date="2024-01-01", end_date="2024-01-03")

    assert result == ["01-01-2024", "03-01-2024"]


def test_get_missing_days_excludes_empty_days(tmp_db: Path) -> None:
    init_db(tmp_db)
    upsert_empty_day(tmp_db, "2024-01-02")

    result = get_missing_days(tmp_db, start_date="2024-01-01", end_date="2024-01-03")

    assert result == ["01-01-2024", "03-01-2024"]
