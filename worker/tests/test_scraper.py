from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from lac_worker.db import init_db, list_empty_days, upsert_empty_day
from lac_worker.scraper import process_day, run_scraper


@pytest.fixture
def initialized_db(tmp_db: Path) -> Path:
    init_db(tmp_db)
    return tmp_db


def _ddmmyyyy(d: date) -> str:
    return d.strftime("%d-%m-%Y")


def _iso(d: date) -> str:
    return d.isoformat()


def test_process_day_inserts_measures_when_api_returns_data(initialized_db: Path) -> None:
    target = date.today() - timedelta(days=10)
    measures = [
        {"date": _ddmmyyyy(target), "heure": "08:00", "valeur": 665.0, "unite": "mNGF"},
        {"date": _ddmmyyyy(target), "heure": "08:20", "valeur": 665.1, "unite": "mNGF"},
    ]
    with patch("lac_worker.scraper.fetch_day", return_value=measures):
        process_day(initialized_db, _ddmmyyyy(target), api_base="x", auth="x")

    with sqlite3.connect(initialized_db) as conn:
        count = conn.execute("SELECT COUNT(*) FROM water_level").fetchone()[0]
    assert count == 2


def test_process_day_marks_empty_when_old_and_no_measures(initialized_db: Path) -> None:
    old = date.today() - timedelta(days=30)
    with patch("lac_worker.scraper.fetch_day", return_value=[]):
        process_day(initialized_db, _ddmmyyyy(old), api_base="x", auth="x")

    assert _iso(old) in list_empty_days(initialized_db)


def test_process_day_does_not_mark_empty_when_recent_no_measures(initialized_db: Path) -> None:
    recent = date.today() - timedelta(days=2)
    with patch("lac_worker.scraper.fetch_day", return_value=[]):
        process_day(initialized_db, _ddmmyyyy(recent), api_base="x", auth="x")

    assert _iso(recent) not in list_empty_days(initialized_db)


def test_process_day_clears_empty_marker_when_api_finally_publishes(initialized_db: Path) -> None:
    target = date.today() - timedelta(days=30)
    # Pre-mark as empty
    upsert_empty_day(initialized_db, _iso(target))
    measures = [
        {"date": _ddmmyyyy(target), "heure": "08:00", "valeur": 665.0, "unite": "mNGF"},
    ]
    with patch("lac_worker.scraper.fetch_day", return_value=measures):
        process_day(initialized_db, _ddmmyyyy(target), api_base="x", auth="x")

    assert _iso(target) not in list_empty_days(initialized_db)


def test_process_day_idempotent_on_repeat_empty_old_day(initialized_db: Path) -> None:
    old = date.today() - timedelta(days=30)
    with patch("lac_worker.scraper.fetch_day", return_value=[]):
        process_day(initialized_db, _ddmmyyyy(old), api_base="x", auth="x")
        process_day(initialized_db, _ddmmyyyy(old), api_base="x", auth="x")

    with sqlite3.connect(initialized_db) as conn:
        row = conn.execute(
            "SELECT attempts FROM empty_days WHERE date_event = ?",
            (_iso(old),),
        ).fetchone()
    assert row[0] == 2


def test_run_scraper_calls_process_for_each_missing_day(initialized_db: Path) -> None:
    # No data in DB; missing days = today's date going back to start_date
    # We use a very recent start_date to keep the loop short.
    start = (date.today() - timedelta(days=3)).isoformat()

    seen = []

    def fake_process(_db_path, date_str, *, api_base, auth):
        seen.append(date_str)
        return 0

    with patch("lac_worker.scraper.process_day", side_effect=fake_process):
        run_scraper(initialized_db, start_date=start, api_base="x", auth="x")

    # Expect 4 calls : 3 missing days + today (deduplicated, today only once)
    assert len(seen) == 4
    assert _ddmmyyyy(date.today()) in seen


def test_run_scraper_also_refreshes_last_recorded_day(initialized_db: Path) -> None:
    # Insert a measure 5 days ago to make it "the last recorded day"
    five_days_ago = date.today() - timedelta(days=5)
    from lac_worker.db import add_measure as _add
    _add(initialized_db, _ddmmyyyy(five_days_ago), "08:00", 665.0, "mNGF")

    seen = []

    def fake_process(_db_path, date_str, *, api_base, auth):
        seen.append(date_str)
        return 0

    with patch("lac_worker.scraper.process_day", side_effect=fake_process):
        run_scraper(
            initialized_db,
            start_date=(date.today() - timedelta(days=6)).isoformat(),
            api_base="x",
            auth="x",
        )

    # The last recorded day (5 days ago) should appear in the calls
    # (refresh pass), even though it has data.
    assert _ddmmyyyy(five_days_ago) in seen
