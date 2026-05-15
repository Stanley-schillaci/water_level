"""Orchestration: scrape missing days, auto-mark empty days."""

from __future__ import annotations

import logging
import random
import time
from datetime import date, datetime
from pathlib import Path

from lac_worker.api import fetch_day
from lac_worker.db import (
    add_measure,
    delete_empty_day,
    get_missing_days,
    load_first_measure_per_day,
    upsert_empty_day,
)


logger = logging.getLogger(__name__)


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


def run_scraper(
    db_path: Path,
    *,
    start_date: str,
    api_base: str,
    auth: str,
) -> dict:
    """
    Scrape all missing days from start_date to today, plus refresh today and
    the last recorded day.

    Returns a summary dict {missing_count, today_processed, last_day_processed}.
    """
    missing = get_missing_days(db_path, start_date=start_date)
    logger.info("scraper: %d missing days to process", len(missing))

    today_str = date.today().strftime("%d-%m-%Y")
    processed: set[str] = set()

    for d in missing:
        try:
            process_day(db_path, d, api_base=api_base, auth=auth)
            processed.add(d)
        except Exception as e:
            logger.error("scraper: failed processing %s: %s", d, e)
        time.sleep(random.uniform(0.1, 0.5))  # polite to upstream

    # Always refresh today (even if already processed via missing, the API may
    # have published new measurements). Skip if missing already covered it.
    if today_str not in processed:
        try:
            process_day(db_path, today_str, api_base=api_base, auth=auth)
            processed.add(today_str)
        except Exception as e:
            logger.error("scraper: failed processing today (%s): %s", today_str, e)

    # Refresh the last recorded day if it isn't today and wasn't just processed.
    rows = load_first_measure_per_day(db_path)
    if rows:
        last_iso = max(r["date_event"] for r in rows)
        last_dt = datetime.strptime(last_iso, "%Y-%m-%d").date()
        last_str = last_dt.strftime("%d-%m-%Y")
        if last_str != today_str and last_str not in processed:
            try:
                process_day(db_path, last_str, api_base=api_base, auth=auth)
            except Exception as e:
                logger.error("scraper: failed refreshing last day (%s): %s", last_str, e)

    return {"missing_count": len(missing), "today": today_str}
