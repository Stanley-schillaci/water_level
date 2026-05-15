"""KPI computation over the water_level table."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from lac_worker.db import load_all_measures


def _value_at_or_before(measures: list[dict], target: datetime) -> float | None:
    """Return the value of the latest measure with datetime <= target, or None."""
    matching = [m for m in measures if datetime.fromisoformat(m["datetime_event"]) <= target]
    if not matching:
        return None
    latest = max(matching, key=lambda m: m["datetime_event"])
    return float(latest["value"])


def compute_kpis(db_path: Path) -> dict:
    """Compute current level + deltas vs yesterday/3d/1week + 7d trend."""
    measures = load_all_measures(db_path)
    if not measures:
        return {
            "last_datetime": None,
            "level": None,
            "vs_j1": None,
            "vs_j3": None,
            "vs_s1": None,
            "trend_7d_m_per_day": None,
        }

    last = measures[-1]
    last_dt = datetime.fromisoformat(last["datetime_event"])
    level = float(last["value"])

    v_j1 = _value_at_or_before(measures, last_dt - timedelta(days=1))
    v_j3 = _value_at_or_before(measures, last_dt - timedelta(days=3))
    v_s1 = _value_at_or_before(measures, last_dt - timedelta(days=7))

    return {
        "last_datetime": last["datetime_event"],
        "level": level,
        "vs_j1": (level - v_j1) if v_j1 is not None else None,
        "vs_j3": (level - v_j3) if v_j3 is not None else None,
        "vs_s1": (level - v_s1) if v_s1 is not None else None,
        "trend_7d_m_per_day": ((level - v_s1) / 7.0) if v_s1 is not None else None,
    }


def compute_annual_comparison(db_path: Path) -> dict:
    """Compare current level to same date 1/2/3 years ago (±3 days window)."""
    measures = load_all_measures(db_path)
    if not measures:
        return {"vs_y1": None, "vs_y2": None, "vs_y3": None}

    last_dt = datetime.fromisoformat(measures[-1]["datetime_event"])
    level = float(measures[-1]["value"])

    result: dict[str, float | None] = {}
    for n in (1, 2, 3):
        target = last_dt - timedelta(days=365 * n)
        window_start = target - timedelta(days=3)
        window_end = target + timedelta(days=3)
        candidates = [
            m
            for m in measures
            if window_start <= datetime.fromisoformat(m["datetime_event"]) <= window_end
        ]
        if not candidates:
            result[f"vs_y{n}"] = None
            continue
        closest = min(
            candidates,
            key=lambda m: abs(
                (datetime.fromisoformat(m["datetime_event"]) - target).total_seconds()
            ),
        )
        result[f"vs_y{n}"] = level - float(closest["value"])
    return result
