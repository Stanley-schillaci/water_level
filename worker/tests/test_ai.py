from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from lac_worker.ai import (
    build_user_prompt,
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


def test_user_prompt_includes_core_data() -> None:
    kpis = {
        "last_datetime": "2026-05-15 14:20:00",
        "level": 666.97,
        "vs_j1": -0.08,
        "vs_j3": -0.22,
        "vs_s1": -0.42,
        "trend_7d_m_per_day": -0.06,
    }
    settings = {
        "ponton_fixe_calibration_mngf": 664.67,
        "ponton_amovible_calibration_mngf": None,
        "boat_draft_m": 1.5,
        "vigilance_margin_m": 0.5,
        "ai_system_prompt": "irrelevant",
    }
    prompt = build_user_prompt(
        kpis=kpis,
        settings=settings,
        active_ponton="fixe",
        last_calibration={"created_at": "2026-05-14 18:00:00"},
        threshold_lines=[
            {"name": "Ponton à terre", "value": 665.00, "description": "Bascule amovible"},
        ],
        recent_messages=[],
        now=datetime(2026, 5, 16, 14, 55),
    )
    assert "666.97" in prompt
    assert "Ponton actif : fixe" in prompt
    assert "664.67" in prompt
    # Profondeur sous coque = 666.97 - 664.67 = 2.30
    assert "2.30" in prompt
    assert "1.50" in prompt
    # Seuil critique
    assert "2.00 m" in prompt
    # Repère personnel
    assert "Ponton à terre" in prompt
    # Tendance
    assert "-0.060" in prompt or "-0.06" in prompt


def test_user_prompt_handles_no_calibration() -> None:
    kpis = {
        "last_datetime": "2026-05-15 14:20:00",
        "level": 666.97,
        "vs_j1": None,
        "vs_j3": None,
        "vs_s1": None,
        "trend_7d_m_per_day": None,
    }
    settings = {
        "ponton_fixe_calibration_mngf": None,
        "ponton_amovible_calibration_mngf": None,
        "boat_draft_m": 1.5,
        "vigilance_margin_m": 0.5,
        "ai_system_prompt": "",
    }
    prompt = build_user_prompt(
        kpis=kpis,
        settings=settings,
        active_ponton=None,
        last_calibration=None,
        threshold_lines=[],
        recent_messages=[],
        now=datetime(2026, 5, 16, 14, 55),
    )
    assert "Ponton actif : inconnu" in prompt
    assert "Calibration : non disponible" in prompt


def test_user_prompt_injects_recent_messages() -> None:
    kpis = {"last_datetime": "x", "level": 666.0, "vs_j1": None, "vs_j3": None, "vs_s1": None, "trend_7d_m_per_day": None}
    settings = {
        "ponton_fixe_calibration_mngf": 664.0,
        "ponton_amovible_calibration_mngf": None,
        "boat_draft_m": 1.5,
        "vigilance_margin_m": 0.5,
        "ai_system_prompt": "",
    }
    recent = [
        {"created_at": "2026-05-15 18:55:00", "response": "Phrase d'hier soir."},
        {"created_at": "2026-05-15 14:55:00", "response": "Phrase d'hier après-midi."},
    ]
    prompt = build_user_prompt(
        kpis=kpis,
        settings=settings,
        active_ponton="fixe",
        last_calibration={"created_at": "2026-05-10 12:00:00"},
        threshold_lines=[],
        recent_messages=recent,
        now=datetime(2026, 5, 16, 14, 55),
    )
    assert "PHRASES PRÉCÉDENTES" in prompt
    assert "Phrase d'hier soir." in prompt
    assert "Phrase d'hier après-midi." in prompt


def test_call_openai_logs_to_db(tmp_db: Path) -> None:
    init_db(tmp_db)
    fake_client = Mock()
    fake_client.chat.completions.create.return_value = _fake_completion("Réponse.", 100, 20)

    result = call_openai(
        client=fake_client,
        db_path=tmp_db,
        system_prompt="Tu es un assistant.",
        user_prompt="Génère une phrase.",
        kind="tendance",
        max_tokens=200,
        temperature=0.6,
    )

    assert result == "Réponse."
    # Vérif que system+user ont bien été envoyés à OpenAI
    call_args = fake_client.chat.completions.create.call_args
    messages = call_args.kwargs["messages"]
    assert messages[0] == {"role": "system", "content": "Tu es un assistant."}
    assert messages[1] == {"role": "user", "content": "Génère une phrase."}
    # Le user prompt est ce qui est loggé (la table gpt_logs)
    with sqlite3.connect(tmp_db) as conn:
        row = conn.execute("SELECT response, total_tokens, type, prompt FROM gpt_logs").fetchone()
    assert row[0] == "Réponse."
    assert row[1] == 120
    assert row[2] == "tendance"
    assert row[3] == "Génère une phrase."


def test_run_ai_refresher_skips_when_empty(tmp_db: Path) -> None:
    init_db(tmp_db)
    fake_client = Mock()

    result = run_ai_refresher(client=fake_client, db_path=tmp_db)

    assert result == {"tendance": None}
    fake_client.chat.completions.create.assert_not_called()


def test_run_ai_refresher_generates_one_phrase(tmp_db: Path) -> None:
    init_db(tmp_db)
    base = datetime.now().replace(second=0, microsecond=0)
    add_measure(tmp_db, base.strftime("%d-%m-%Y"), base.strftime("%H:%M"), 665.5, "mNGF")
    earlier = base - timedelta(days=8)
    add_measure(tmp_db, earlier.strftime("%d-%m-%Y"), earlier.strftime("%H:%M"), 665.0, "mNGF")

    fake_client = Mock()
    fake_client.chat.completions.create.return_value = _fake_completion("Phrase tendance.")

    result = run_ai_refresher(client=fake_client, db_path=tmp_db)

    # En V2.3 on ne génère plus qu'une seule phrase ('tendance').
    assert result == {"tendance": "Phrase tendance."}
    assert fake_client.chat.completions.create.call_count == 1
