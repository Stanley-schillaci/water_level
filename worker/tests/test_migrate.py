from __future__ import annotations

import sqlite3
from pathlib import Path

from lac_worker.db import init_db, list_empty_days
from lac_worker.migrate import V1_IGNORE_DATES, migrate_v1_to_v2


def test_migrate_inserts_all_v1_ignored_dates(tmp_db: Path) -> None:
    init_db(tmp_db)

    migrate_v1_to_v2(tmp_db)

    after = list_empty_days(tmp_db)
    assert len(after) == len(V1_IGNORE_DATES)
    assert "2021-09-04" in after
    assert "2025-02-17" in after


def test_migrate_is_idempotent(tmp_db: Path) -> None:
    init_db(tmp_db)
    migrate_v1_to_v2(tmp_db)
    migrate_v1_to_v2(tmp_db)

    assert len(list_empty_days(tmp_db)) == len(V1_IGNORE_DATES)


def test_migrate_activates_wal_and_creates_index(tmp_db: Path) -> None:
    migrate_v1_to_v2(tmp_db)

    with sqlite3.connect(tmp_db) as conn:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        idx = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
            ("idx_water_level_date_event",),
        ).fetchone()
    assert mode == "wal"
    assert idx is not None
