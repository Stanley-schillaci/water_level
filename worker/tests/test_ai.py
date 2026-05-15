from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from lac_worker.ai import (
    build_annual_prompt,
    build_commentary_prompt,
    call_openai,
    run_ai_refresher,
)
from lac_worker.db import add_measure, init_db


def _fake_completion(text: str, in_tok: int = 80, out_tok: int = 12) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        usage=SimpleNamespace(
            prompt_tokens=in_tok,
            completion_tokens=out_tok,
            total_tokens=in_tok + out_tok,
        ),
    )


def test_commentary_prompt_includes_data_and_thresholds() -> None:
    kpis = {
        "last_datetime": "2026-05-15 14:20:00",
        "level": 665.42,
        "vs_j1": 0.04,
        "vs_j3": -0.12,
        "vs_s1": -0.18,
        "trend_7d_m_per_day": -0.025,
    }
    thresholds = [
        {"name": "Seuil bas", "description": "Coque touche", "value": 663.00},
    ]

    prompt = build_commentary_prompt(kpis, thresholds)

    assert "665.42" in prompt
    assert "Seuil bas" in prompt
    assert "663.00" in prompt
    assert "UNE PHRASE" in prompt


def test_annual_prompt_omits_none_years() -> None:
    kpis = {"level": 665.42, "vs_y1": 0.20, "vs_y2": None, "vs_y3": None}

    prompt = build_annual_prompt(kpis, current_year=2026)

    assert "2025" in prompt
    assert "0.20" in prompt
    assert "2024" not in prompt


def test_call_openai_logs_to_db(tmp_db: Path) -> None:
    init_db(tmp_db)
    fake_client = Mock()
    fake_client.chat.completions.create.return_value = _fake_completion("Réponse.", 100, 20)

    result = call_openai(
        client=fake_client,
        db_path=tmp_db,
        prompt="x",
        kind="tendance",
        max_tokens=180,
        temperature=0.7,
    )

    assert result == "Réponse."
    with sqlite3.connect(tmp_db) as conn:
        row = conn.execute("SELECT response, total_tokens, type FROM gpt_logs").fetchone()
    assert row[0] == "Réponse."
    assert row[1] == 120
    assert row[2] == "tendance"


def test_run_ai_refresher_skips_when_empty(tmp_db: Path) -> None:
    init_db(tmp_db)
    fake_client = Mock()

    result = run_ai_refresher(client=fake_client, db_path=tmp_db)

    assert result == {"tendance": None, "comparaison_annuelle": None}
    fake_client.chat.completions.create.assert_not_called()


def test_run_ai_refresher_generates_both_kinds(tmp_db: Path) -> None:
    init_db(tmp_db)
    base = datetime.now().replace(second=0, microsecond=0)
    add_measure(tmp_db, base.strftime("%d-%m-%Y"), base.strftime("%H:%M"), 665.5, "mNGF")
    earlier = base - timedelta(days=8)
    add_measure(tmp_db, earlier.strftime("%d-%m-%Y"), earlier.strftime("%H:%M"), 665.0, "mNGF")

    fake_client = Mock()
    fake_client.chat.completions.create.side_effect = [
        _fake_completion("Phrase tendance."),
        _fake_completion("Phrase annuelle."),
    ]

    result = run_ai_refresher(client=fake_client, db_path=tmp_db)

    assert result["tendance"] == "Phrase tendance."
    assert result["comparaison_annuelle"] == "Phrase annuelle."
    assert fake_client.chat.completions.create.call_count == 2
