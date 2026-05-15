from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pytest

from lac_worker.db import add_measure, init_db
from lac_worker.kpi import compute_annual_comparison, compute_kpis


def _populate_recent(db_path: Path) -> None:
    """Seed: now=665.50, -1d=665.30, -3d=665.10, -7d=664.80."""
    init_db(db_path)
    now = datetime.now().replace(second=0, microsecond=0)
    for delta_days, value in [(0, 665.50), (1, 665.30), (3, 665.10), (7, 664.80)]:
        dt = now - timedelta(days=delta_days)
        add_measure(db_path, dt.strftime("%d-%m-%Y"), dt.strftime("%H:%M"), value, "mNGF")


def test_compute_kpis_level_and_all_deltas(tmp_db: Path) -> None:
    _populate_recent(tmp_db)
    kpis = compute_kpis(tmp_db)

    assert kpis["level"] == pytest.approx(665.50, abs=0.001)
    assert kpis["vs_j1"] == pytest.approx(0.20, abs=0.01)
    assert kpis["vs_j3"] == pytest.approx(0.40, abs=0.01)
    assert kpis["vs_s1"] == pytest.approx(0.70, abs=0.01)
    assert kpis["trend_7d_m_per_day"] == pytest.approx(0.10, abs=0.01)
    assert isinstance(kpis["last_datetime"], str)


def test_compute_kpis_returns_none_dict_when_empty(tmp_db: Path) -> None:
    init_db(tmp_db)
    kpis = compute_kpis(tmp_db)

    assert kpis["level"] is None
    assert kpis["vs_j1"] is None


def test_annual_comparison_returns_deltas_per_year(tmp_db: Path) -> None:
    init_db(tmp_db)
    today = datetime.now().replace(second=0, microsecond=0)
    add_measure(tmp_db, today.strftime("%d-%m-%Y"), today.strftime("%H:%M"), 665.50, "mNGF")
    y1 = today - timedelta(days=365)
    add_measure(tmp_db, y1.strftime("%d-%m-%Y"), "08:00", 665.20, "mNGF")
    y2 = today - timedelta(days=2 * 365)
    add_measure(tmp_db, y2.strftime("%d-%m-%Y"), "08:00", 665.00, "mNGF")

    result = compute_annual_comparison(tmp_db)

    assert result["vs_y1"] == pytest.approx(0.30, abs=0.05)
    assert result["vs_y2"] == pytest.approx(0.50, abs=0.05)
    assert result["vs_y3"] is None


def test_annual_comparison_all_none_when_no_history(tmp_db: Path) -> None:
    init_db(tmp_db)
    now = datetime.now()
    add_measure(tmp_db, now.strftime("%d-%m-%Y"), now.strftime("%H:%M"), 665.0, "mNGF")

    result = compute_annual_comparison(tmp_db)

    assert result == {"vs_y1": None, "vs_y2": None, "vs_y3": None}
