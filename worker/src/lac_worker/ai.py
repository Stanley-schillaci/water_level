"""LLM calls for the daily commentary sentence (V2.3).

Architecture en system + user prompts :
- system : statique, éditable par papa dans /admin (stocké en DB).
- user : construit à chaque tick avec les données temps réel
  (niveau, calibrations, ponton actif, seuils dérivés, repères personnels
  threshold_line, et les 7 dernières phrases pour continuité narrative).

La phrase "comparaison annuelle" a été supprimée en V2.3 (doublonnait les
KPIs VS 2024/2023/2022 sur la page /annuel).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from openai import OpenAI

from lac_worker.db import (
    get_active_ponton,
    get_display_settings,
    get_last_calibration,
    get_recent_ai_messages,
    get_threshold_lines,
    log_gpt_call,
)
from lac_worker.kpi import compute_kpis

MODEL = "gpt-4o"
MAX_TOKENS_COMMENTARY = 200
TEMPERATURE = 0.6
RECENT_MESSAGES_COUNT = 7


def _format_calibration_age(calibration_created_at: str | None, now: datetime) -> str:
    """Return a human-readable freshness like 'aujourd'hui', 'il y a 2 jours', etc."""
    if not calibration_created_at:
        return "jamais étalonné"
    try:
        dt = datetime.strptime(calibration_created_at, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return "date inconnue"
    age = now - dt
    days = age.days
    if days <= 0:
        return "aujourd'hui"
    if days == 1:
        return "hier"
    return f"il y a {days} jours"


def build_user_prompt(
    *,
    kpis: dict,
    settings: dict,
    active_ponton: str | None,
    last_calibration: dict | None,
    threshold_lines: list[dict],
    recent_messages: list[dict],
    now: datetime,
) -> str:
    """Construit le user prompt — toutes les data temps réel formatées."""
    level = kpis.get("level")
    boat_draft = settings.get("boat_draft_m", 1.5)
    vigilance_margin = settings.get("vigilance_margin_m", 0.5)

    # Calibration courante = celle du ponton actif (ou rien si pas d'historique).
    if active_ponton == "fixe":
        calibration = settings.get("ponton_fixe_calibration_mngf")
    elif active_ponton == "amovible":
        calibration = settings.get("ponton_amovible_calibration_mngf")
    else:
        calibration = None

    depth_under_hull = None
    if level is not None and calibration is not None:
        depth_under_hull = level - calibration

    lines: list[str] = []
    lines.append(f"DONNÉES ({now.strftime('%Y-%m-%d %H:%M')})")
    if level is not None:
        lines.append(f"- Niveau du lac : {level:.2f} mNGF")
    else:
        lines.append("- Niveau du lac : indisponible")
    if active_ponton:
        lines.append(f"- Ponton actif : {active_ponton}")
    else:
        lines.append("- Ponton actif : inconnu (aucun étalonnage encore enregistré)")
    if calibration is not None and last_calibration is not None:
        age = _format_calibration_age(last_calibration.get("created_at"), now)
        lines.append(
            f"- Calibration ponton {active_ponton} : {calibration:.2f} mNGF (étalonné {age})",
        )
    else:
        lines.append("- Calibration : non disponible")
    if depth_under_hull is not None:
        lines.append(f"- Profondeur sous coque : {depth_under_hull:.2f} m")
    lines.append(f"- Tirant d'eau du bateau : {boat_draft:.2f} m")
    lines.append(f"- Marge de vigilance : {vigilance_margin:.2f} m")
    lines.append(
        f"- Seuils dérivés : critique = {boat_draft:.2f} m, vigilance = {boat_draft + vigilance_margin:.2f} m",
    )
    trend = kpis.get("trend_7d_m_per_day")
    if trend is not None:
        sign = "baisse" if trend < 0 else "hausse" if trend > 0 else "stable"
        lines.append(f"- Tendance 7 jours : {trend:+.3f} m/jour ({sign})")
    for k_n, label in (("vs_j1", "ΔJ-1"), ("vs_j3", "ΔJ-3"), ("vs_s1", "ΔJ-7")):
        v = kpis.get(k_n)
        if v is not None:
            lines.append(f"- {label} : {v:+.2f} m")

    if threshold_lines:
        lines.append("")
        lines.append("REPÈRES PERSONNELS DE PAPA (lignes threshold_line)")
        for t in threshold_lines:
            desc = (t.get("description") or "").strip()
            if desc:
                lines.append(f"- \"{t['name']}\" ({t['value']:.2f} mNGF) : {desc}")
            else:
                lines.append(f"- \"{t['name']}\" ({t['value']:.2f} mNGF)")

    if recent_messages:
        lines.append("")
        lines.append(
            f"PHRASES PRÉCÉDENTES (jusqu'à {RECENT_MESSAGES_COUNT}, plus récente en haut)",
        )
        for m in recent_messages:
            ts = m.get("created_at", "")
            response = m.get("response", "").strip()
            lines.append(f"- {ts} — {response}")

    lines.append("")
    lines.append(f"Génère la phrase pour {now.strftime('%Y-%m-%d %H:%M')}.")
    return "\n".join(lines)


def call_openai(
    *,
    client: OpenAI,
    db_path: Path,
    system_prompt: str,
    user_prompt: str,
    kind: str,
    max_tokens: int,
    temperature: float,
) -> str:
    """Send system+user to OpenAI, log the call, return the text."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    content = response.choices[0].message.content.strip()
    usage = response.usage
    # On log les 2 prompts (system + user) pour permettre un audit complet
    # depuis le panel admin (« qu'est-ce qu'on a envoyé à l'IA à 14:55 ? »).
    log_gpt_call(
        db_path,
        model=MODEL,
        prompt=user_prompt,
        response=content,
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        total_tokens=usage.total_tokens,
        kind=kind,
        system_prompt=system_prompt,
    )
    return content


def run_ai_refresher(*, client: OpenAI, db_path: Path) -> dict:
    """Compute KPIs, build system+user, call OpenAI once, persist.

    Returns {'tendance': str|None}. Skips if water_level is empty.
    """
    kpis = compute_kpis(db_path)
    if kpis["level"] is None:
        return {"tendance": None}

    settings = get_display_settings(db_path)
    active_ponton = get_active_ponton(db_path)
    last_cal = get_last_calibration(db_path)
    thresholds = get_threshold_lines(db_path)
    recent = get_recent_ai_messages(db_path, kind="tendance", limit=RECENT_MESSAGES_COUNT)

    system_prompt = settings.get("ai_system_prompt") or ""
    user_prompt = build_user_prompt(
        kpis=kpis,
        settings=settings,
        active_ponton=active_ponton,
        last_calibration=last_cal,
        threshold_lines=thresholds,
        recent_messages=recent,
        now=datetime.now(),
    )

    tendance = call_openai(
        client=client,
        db_path=db_path,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        kind="tendance",
        max_tokens=MAX_TOKENS_COMMENTARY,
        temperature=TEMPERATURE,
    )
    return {"tendance": tendance}
