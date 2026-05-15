"""One-shot V1 -> V2 migration.

Copies the 11 dates that V1 maintained manually in ignore_dates.yaml into
the new empty_days table. Activates WAL and the date index via init_db().
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from lac_worker.db import connect, init_db, upsert_empty_day


logger = logging.getLogger(__name__)


# Hard-coded list from V1 ignore_dates.yaml @ tag v1.0.0
V1_IGNORE_DATES_DDMMYYYY = [
    "04-09-2021",
    "07-09-2021",
    "19-10-2022",
    "20-10-2022",
    "21-10-2022",
    "22-10-2022",
    "19-08-2023",
    "21-06-2024",
    "22-06-2024",
    "17-02-2025",
    "18-02-2025",
]
V1_IGNORE_DATES = [
    datetime.strptime(d, "%d-%m-%Y").date().isoformat()
    for d in V1_IGNORE_DATES_DDMMYYYY
]


def migrate_v1_to_v2(db_path: Path) -> None:
    """Apply the V1 -> V2 schema/data migration. Idempotent."""
    init_db(db_path)  # ensures all tables exist + WAL + index

    with connect(db_path) as conn:
        existing = {
            r["date_event"]
            for r in conn.execute("SELECT date_event FROM empty_days").fetchall()
        }

    new_count = 0
    for iso in V1_IGNORE_DATES:
        if iso in existing:
            continue
        upsert_empty_day(db_path, iso)
        new_count += 1

    logger.info(
        "migrate: %d/%d dates added to empty_days (others already present)",
        new_count,
        len(V1_IGNORE_DATES),
    )
