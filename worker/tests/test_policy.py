"""Tests for the AI policy decision logic.

Note : `should_generate_now(now_paris_naive, policy, last_run_at_utc)`.
Les `last_run_at` dans ces tests sont des datetimes UTC naïfs (comme stockés
par SQLite CURRENT_TIMESTAMP). On utilise des UTC arbitraires : ce qui compte
c'est le delta avec `now_paris_naive` (qui doit être convergi correctement
via la conversion UTC→Paris implémentée dans should_generate_now).
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from lac_worker.policy import (
    MIN_GAP_MINUTES,
    is_high_season,
    now_paris,
    parse_db_datetime,
    should_generate_now,
)

DEFAULT_POLICY = {
    "enabled": 1,
    "high_season_months": "5,6,7,8",
    "high_season_hours": "6,10,14,18",
    "low_season_hours": "7",
    "last_run_at": None,
}

PARIS = ZoneInfo("Europe/Paris")


def _paris_to_utc(paris_naive: datetime) -> datetime:
    """Helper pour les tests : convertit Paris→UTC pour simuler last_run_at."""
    return (
        paris_naive.replace(tzinfo=PARIS)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


def test_is_high_season_true_in_july():
    assert is_high_season(datetime(2026, 7, 15, 14, 0), DEFAULT_POLICY) is True


def test_is_high_season_false_in_january():
    assert is_high_season(datetime(2026, 1, 15, 14, 0), DEFAULT_POLICY) is False


def test_disabled_never_generates():
    p = {**DEFAULT_POLICY, "enabled": 0}
    ok, reason = should_generate_now(datetime(2026, 7, 7, 6, 0), p, None)
    assert ok is False
    assert reason == "disabled"


def test_high_season_at_allowed_hour_generates():
    # 14h fait partie du défaut 6,10,14,18
    ok, reason = should_generate_now(datetime(2026, 7, 7, 14, 0), DEFAULT_POLICY, None)
    assert ok is True
    assert reason == "high_season"


def test_high_season_at_disallowed_hour_skips():
    # 13h n'est pas dans "6,10,14,18"
    ok, reason = should_generate_now(datetime(2026, 7, 7, 13, 0), DEFAULT_POLICY, None)
    assert ok is False
    assert reason == "high_season_off_hour"


def test_low_season_at_allowed_hour_generates():
    ok, reason = should_generate_now(datetime(2026, 2, 7, 7, 0), DEFAULT_POLICY, None)
    assert ok is True
    assert reason == "low_season"


def test_low_season_at_disallowed_hour_skips():
    ok, reason = should_generate_now(datetime(2026, 2, 7, 14, 0), DEFAULT_POLICY, None)
    assert ok is False
    assert reason == "low_season_off_hour"


def test_anti_doublon_too_recent_skips():
    now_paris_naive = datetime(2026, 7, 7, 14, 0)
    # last run il y a 30 min en heure de Paris → stockée en UTC il y a 30 min aussi
    last_utc = _paris_to_utc(now_paris_naive - timedelta(minutes=30))
    ok, reason = should_generate_now(now_paris_naive, DEFAULT_POLICY, last_utc)
    assert ok is False
    assert reason == "too_recent"


def test_anti_doublon_old_enough_generates():
    now_paris_naive = datetime(2026, 7, 7, 14, 0)
    last_utc = _paris_to_utc(now_paris_naive - timedelta(minutes=MIN_GAP_MINUTES + 10))
    ok, reason = should_generate_now(now_paris_naive, DEFAULT_POLICY, last_utc)
    assert ok is True


def test_dst_summer_no_anti_doublon_glitch():
    # En été (UTC+2), un last_run UTC à 12:00 = Paris 14:00.
    # Si on appelait à 14:30 Paris, on devrait skip (only 30min elapsed).
    # Vérifie qu'on ne se trompe pas de 2h en oubliant la conversion.
    now_paris_naive = datetime(2026, 7, 7, 14, 30)  # Paris été
    last_utc = datetime(2026, 7, 7, 12, 0)  # = 14:00 Paris
    ok, reason = should_generate_now(now_paris_naive, DEFAULT_POLICY, last_utc)
    assert ok is False
    assert reason == "too_recent"


def test_dst_winter_no_anti_doublon_glitch():
    # En hiver (UTC+1), un last_run UTC à 13:00 = Paris 14:00.
    p = {**DEFAULT_POLICY, "low_season_hours": "14"}
    now_paris_naive = datetime(2026, 2, 7, 14, 30)
    last_utc = datetime(2026, 2, 7, 13, 0)  # = 14:00 Paris
    ok, reason = should_generate_now(now_paris_naive, p, last_utc)
    assert ok is False
    assert reason == "too_recent"


def test_empty_high_season_months_falls_back_to_low_season():
    p = {**DEFAULT_POLICY, "high_season_months": ""}
    ok, reason = should_generate_now(datetime(2026, 7, 7, 7, 0), p, None)
    assert ok is True
    assert reason == "low_season"


def test_off_when_no_hours_anywhere():
    p = {**DEFAULT_POLICY, "low_season_hours": ""}
    ok, reason = should_generate_now(datetime(2026, 2, 7, 7, 0), p, None)
    assert ok is False


def test_parse_db_datetime_handles_none():
    assert parse_db_datetime(None) is None
    assert parse_db_datetime("") is None


def test_parse_db_datetime_parses_sqlite_format():
    assert parse_db_datetime("2026-05-16 12:30:45") == datetime(2026, 5, 16, 12, 30, 45)


def test_parse_db_datetime_returns_none_on_bad_format():
    assert parse_db_datetime("not-a-date") is None


def test_csv_with_spaces_and_duplicates():
    p = {**DEFAULT_POLICY, "high_season_months": "5, 6 , 6 ,7,8"}
    assert is_high_season(datetime(2026, 6, 1, 12, 0), p) is True


def test_now_paris_is_naive_and_realistic():
    n = now_paris()
    assert n.tzinfo is None
    # Sanity : current year matches host machine year (smoke test)
    assert n.year >= 2024
