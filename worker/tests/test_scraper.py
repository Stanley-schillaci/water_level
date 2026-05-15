from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from lac_worker.db import init_db, list_empty_days, upsert_empty_day
from lac_worker.scraper import process_day


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
