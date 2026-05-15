"""Orchestration: scrape missing days, auto-mark empty days."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

from lac_worker.api import fetch_day
from lac_worker.db import (
    add_measure,
    delete_empty_day,
    upsert_empty_day,
)


EMPTY_DAY_AGE_THRESHOLD_DAYS = 7


def _ddmmyyyy_to_date(date_str: str) -> date:
    return datetime.strptime(date_str, "%d-%m-%Y").date()


def process_day(
    db_path: Path,
    date_str: str,
    *,
    api_base: str,
    auth: str,
) -> int:
    """
    Fetch measures for a single day and persist them.

    Behavior:
    - If API returns measures: insert them. If the day was previously marked as
      empty, clear that marker.
    - If API returns nothing AND the day is at least 7 days in the past: mark
      the day as empty (or increment attempts if already marked).
    - If API returns nothing for a recent day (<7 days): do nothing — the API
      may still publish backdated data.

    Returns the number of new measures inserted.
    """
    measures = fetch_day(date_str, base_url=api_base, auth_header=auth)
    target = _ddmmyyyy_to_date(date_str)
    iso = target.isoformat()

    if measures:
        new_count = 0
        for m in measures:
            if add_measure(db_path, m["date"], m["heure"], m["valeur"], m["unite"]):
                new_count += 1
        # If the API now publishes data we previously thought was missing, clean the marker.
        delete_empty_day(db_path, iso)
        return new_count

    # No measures returned. Decide if we mark this day as empty.
    age = (date.today() - target).days
    if age >= EMPTY_DAY_AGE_THRESHOLD_DAYS:
        upsert_empty_day(db_path, iso)
    return 0
