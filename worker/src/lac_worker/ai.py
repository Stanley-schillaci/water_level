"""LLM calls for the daily commentary + annual comparison sentences."""

from __future__ import annotations

from datetime import datetime as _datetime
from pathlib import Path

from openai import OpenAI

from lac_worker.db import connect, log_gpt_call
from lac_worker.kpi import compute_annual_comparison, compute_kpis

MODEL = "gpt-4o"
MAX_TOKENS_COMMENTARY = 180
MAX_TOKENS_ANNUAL = 100


def build_commentary_prompt(kpis: dict, thresholds: list[dict]) -> str:
    """Build the prompt for the daily 'tendance' sentence."""
    lines = [
        "Tu es un assistant expert en hydrologie.",
        "Tu dois aider un opérateur nautique à décider s'il faut déplacer un bateau : "
        "ne rien faire, le reculer sur le ponton, ou le déplacer ailleurs.",
        "Le bateau a un tirant d'eau de 0,4 m. Il est amarré sur un ponton flottant relié à la berge.",
        "Le lac est fermé par un barrage et son niveau varie naturellement.",
        "La décision dépend du niveau actuel, de son évolution récente, et des seuils prédéfinis.",
        "",
        "<données>",
        f"Date de la dernière mesure : {kpis['last_datetime']}",
        f"Niveau actuel : {kpis['level']:.2f} m",
        f"Variation par rapport à hier : {kpis['vs_j1']:+.3f} m",
        f"Variation par rapport à il y a 3 jours : {kpis['vs_j3']:+.3f} m",
        f"Variation par rapport à la semaine dernière : {kpis['vs_s1']:+.3f} m",
        f"Tendance sur 7 jours : {kpis['trend_7d_m_per_day']:+.3f} m/j",
        "</données>",
        "",
        "<seuils>",
    ]
    for t in thresholds:
        lines.append(f"- {t['name']} ({t['value']:.2f} m) : {t['description']}")
    lines.append("</seuils>")
    lines.append(
        "<instruction>Rédige UNE PHRASE en français, claire et concise, qui indique ce que doit "
        "faire l'opérateur avec le bateau : ne rien faire, le reculer un peu, ou le déplacer "
        "ailleurs. Tu peux inclure des valeurs utiles (niveau actuel, tendance, seuil atteint). "
        "Sois factuel, et base ta recommandation sur les données ci-dessus. Mentionne un seuil "
        "s'il est proche ou franchi.</instruction>"
    )
    return "\n".join(lines)


def build_annual_prompt(kpis: dict, current_year: int) -> str:
    """Build the prompt for the annual-comparison sentence."""
    lines = [
        "Tu es un assistant expert en hydrologie.",
        "Génère une phrase courte et factuelle en français.",
        "Tu compares uniquement le niveau actuel avec celui des 3 dernières années à la même date.",
        "<données>",
        f"Niveau actuel : {kpis['level']:.2f} m",
    ]
    for n in (1, 2, 3):
        delta = kpis.get(f"vs_y{n}")
        if delta is None:
            continue
        lines.append(f"VS {current_year - n} : {delta:+.2f} m")
    lines.append("</données>")
    lines.append(
        "<instruction>Génère UNE PHRASE neutre et concise résumant si le niveau actuel est plus "
        "haut, équivalent ou plus bas que les années précédentes.</instruction>"
    )
    return "\n".join(lines)


def call_openai(
    *,
    client: OpenAI,
    db_path: Path,
    prompt: str,
    kind: str,
    max_tokens: int,
    temperature: float,
) -> str:
    """Send the prompt to OpenAI, log the call, return the text."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "Tu es un expert en hydrologie, tu rédiges en français."},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    content = response.choices[0].message.content.strip()
    usage = response.usage
    log_gpt_call(
        db_path,
        model=MODEL,
        prompt=prompt,
        response=content,
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        total_tokens=usage.total_tokens,
        kind=kind,
    )
    return content


def _load_thresholds(db_path: Path) -> list[dict]:
    """Return active threshold lines as dicts (sorted by value DESC)."""
    with connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT name, description, value FROM threshold_line
            WHERE is_deleted = 0
            ORDER BY value DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def run_ai_refresher(*, client: OpenAI, db_path: Path) -> dict:
    """Compute KPIs, build both prompts, call OpenAI twice, persist results.

    Returns {'tendance': str|None, 'comparaison_annuelle': str|None}.
    Skips both calls if water_level is empty.
    """
    kpis = compute_kpis(db_path)
    if kpis["level"] is None:
        return {"tendance": None, "comparaison_annuelle": None}

    thresholds = _load_thresholds(db_path)
    prompt_t = build_commentary_prompt(kpis, thresholds)
    tendance = call_openai(
        client=client,
        db_path=db_path,
        prompt=prompt_t,
        kind="tendance",
        max_tokens=MAX_TOKENS_COMMENTARY,
        temperature=0.7,
    )

    annual_kpis = {"level": kpis["level"], **compute_annual_comparison(db_path)}
    prompt_a = build_annual_prompt(annual_kpis, current_year=_datetime.now().year)
    annual = call_openai(
        client=client,
        db_path=db_path,
        prompt=prompt_a,
        kind="comparaison_annuelle",
        max_tokens=MAX_TOKENS_ANNUAL,
        temperature=0.5,
    )

    return {"tendance": tendance, "comparaison_annuelle": annual}
