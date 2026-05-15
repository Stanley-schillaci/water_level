from __future__ import annotations

import pytest

from lac_worker.config import get_settings


def test_settings_reads_lac_db_path_from_env(tmp_path, monkeypatch):
    db = tmp_path / "test.db"
    monkeypatch.setenv("LAC_DB_PATH", str(db))
    monkeypatch.setenv("LAC_API_AUTH", "Basic XYZ")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")

    s = get_settings()

    assert s.db_path == db
    assert s.api_auth == "Basic XYZ"
    assert s.openai_api_key == "sk-fake"


def test_settings_db_path_is_absolute_path(tmp_path, monkeypatch):
    monkeypatch.setenv("LAC_DB_PATH", "./relative.db")
    monkeypatch.setenv("LAC_API_AUTH", "x")
    monkeypatch.setenv("OPENAI_API_KEY", "x")

    s = get_settings()

    assert s.db_path.is_absolute()


def test_settings_missing_required_env_raises(tmp_path, monkeypatch):
    # chdir into a clean directory so any local .env is not picked up
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LAC_DB_PATH", raising=False)
    monkeypatch.delenv("LAC_API_AUTH", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="LAC_DB_PATH"):
        get_settings()
