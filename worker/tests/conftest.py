"""Shared pytest fixtures."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from lac_worker.config import Settings


@pytest.fixture
def tmp_db(tmp_path: Path) -> Path:
    """Return a path to a fresh empty SQLite file."""
    return tmp_path / "niveau_eau.db"


@pytest.fixture
def settings(tmp_db: Path) -> Settings:
    """A Settings instance pointing at a temp DB, with stubbed API/OpenAI keys."""
    return Settings(
        db_path=tmp_db,
        api_auth="Basic test",
        openai_api_key="sk-test",
    )


@pytest.fixture
def empty_initialized_db(tmp_db: Path) -> Iterator[sqlite3.Connection]:
    """Yield a connection to a freshly initialized DB (schema created, no rows)."""
    from lac_worker.db import init_db

    init_db(tmp_db)
    conn = sqlite3.connect(tmp_db)
    try:
        yield conn
    finally:
        conn.close()
