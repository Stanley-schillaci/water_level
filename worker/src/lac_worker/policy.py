"""Decision logic for the AI refresher : faut-il générer maintenant ?

La policy stockée en DB définit :
  - enabled : interrupteur global
  - high_season_months / high_season_hours : périodes "saison haute"
  - low_season_hours : créneaux hors saison

Fuseau horaire — IMPORTANT :
  - Les heures stockées (high_season_hours, low_season_hours) sont des
    **heures de Paris** (Europe/Paris, UTC+1 en hiver et UTC+2 en été).
    L'utilisateur les coche dans l'UI en heure locale, c'est naturel.
  - SQLite `CURRENT_TIMESTAMP` écrit en UTC. On convertit explicitement
    dans `should_generate_now` pour éviter les bugs de DST.
  - Le timer systemd `OnCalendar=*:55:00` s'aligne sur le fuseau du système
    (Europe/Paris sur le VPS, cf bootstrap.sh).

Le worker tourne en cron toutes les heures (xx:55) et appelle
should_generate_now(now_paris, policy, last_run_at_utc) pour décider de
générer ou de skip.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# Anti-doublon : on ne régénère pas si la dernière génération réussie est plus
# récente que 50 min (le timer est à 60 min, donc on tolère une dérive).
MIN_GAP_MINUTES = 50

PARIS = ZoneInfo("Europe/Paris")


def now_paris() -> datetime:
    """Heure courante en Europe/Paris, retournée comme datetime naïve."""
    return datetime.now(PARIS).replace(tzinfo=None)


def _utc_to_paris(naive_utc: datetime) -> datetime:
    """Convertit un datetime naïf (UTC, format SQLite) vers naïf Paris."""
    return naive_utc.replace(tzinfo=timezone.utc).astimezone(PARIS).replace(tzinfo=None)


def _parse_csv_ints(csv: str) -> set[int]:
    """Parse '5,6,7,8' -> {5, 6, 7, 8}. Ignore les entrées vides."""
    out: set[int] = set()
    for chunk in csv.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            out.add(int(chunk))
        except ValueError:
            continue
    return out


def is_high_season(now_paris_naive: datetime, policy: dict) -> bool:
    """True si le mois de `now_paris_naive` figure dans la liste haute saison."""
    months = _parse_csv_ints(policy.get("high_season_months", ""))
    return now_paris_naive.month in months


def should_generate_now(
    now_paris_naive: datetime,
    policy: dict,
    last_run_at_utc: datetime | None,
) -> tuple[bool, str]:
    """Décide si le worker doit générer maintenant.

    Args:
        now_paris_naive: heure courante en Europe/Paris (naïve).
        policy: row de la table ai_policy.
        last_run_at_utc: dernier `last_run_at` lu en DB (naïf, UTC).

    Returns (decision, reason). La raison est utile pour les logs/debug.
    """
    if not policy.get("enabled"):
        return False, "disabled"

    if is_high_season(now_paris_naive, policy):
        allowed_hours = _parse_csv_ints(policy.get("high_season_hours", ""))
        bucket = "high_season"
    else:
        allowed_hours = _parse_csv_ints(policy.get("low_season_hours", ""))
        bucket = "low_season"

    if now_paris_naive.hour not in allowed_hours:
        return False, f"{bucket}_off_hour"

    if last_run_at_utc is not None:
        last_paris = _utc_to_paris(last_run_at_utc)
        elapsed = now_paris_naive - last_paris
        if elapsed < timedelta(minutes=MIN_GAP_MINUTES):
            return False, "too_recent"

    return True, bucket


def parse_db_datetime(s: str | None) -> datetime | None:
    """Parse SQLite's 'YYYY-MM-DD HH:MM:SS' (UTC) into a naive datetime."""
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
