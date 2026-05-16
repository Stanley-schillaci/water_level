"""SQLite layer for the worker. All read/write operations on niveau_eau.db."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

# --- Schema definitions -----------------------------------------------------

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS water_level (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_event DATE,
        datetime_event DATETIME,
        value REAL,
        unit TEXT,
        UNIQUE(datetime_event)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS threshold_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        value REAL NOT NULL,
        color TEXT NOT NULL DEFAULT '#1f77b4',
        dash_style TEXT NOT NULL DEFAULT 'dash',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        is_deleted INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS gpt_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT,
        prompt TEXT,
        response TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL DEFAULT 'tendance'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS empty_days (
        date_event DATE PRIMARY KEY,
        first_attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        attempts INTEGER NOT NULL DEFAULT 1
    )
    """,
    # Singleton: il y a toujours exactement une ligne (id=1).
    # CSV pour high_season_months / *_hours : ex "5,6,7,8" et "6,10,14,18".
    # IMPORTANT : les heures sont en heure de Paris (cf policy.py).
    """
    CREATE TABLE IF NOT EXISTS ai_policy (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 1,
        high_season_months TEXT NOT NULL DEFAULT '5,6,7,8',
        high_season_hours TEXT NOT NULL DEFAULT '6,10,14,18',
        low_season_hours TEXT NOT NULL DEFAULT '7',
        last_run_at DATETIME,
        last_run_status TEXT,
        last_error TEXT,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # V2.3 : display_settings (singleton) — étalonnage + bateau + AI system prompt.
    # Cohérent avec web/src/lib/db.ts. Les colonnes V2.3 sont ajoutées via
    # _migrate_display_settings() pour les DBs existantes.
    """
    CREATE TABLE IF NOT EXISTS display_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ponton_calibration_mngf REAL,                       -- legacy V2.2
        ponton_fixe_calibration_mngf REAL,
        ponton_amovible_calibration_mngf REAL,
        boat_draft_m REAL NOT NULL DEFAULT 0.8,
        vigilance_margin_m REAL NOT NULL DEFAULT 0.3,
        ai_system_prompt TEXT NOT NULL DEFAULT '',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # V2.3 : historique des étalonnages tagués par ponton.
    """
    CREATE TABLE IF NOT EXISTS calibration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lac_level_mngf REAL NOT NULL,
        sonar_depth_m REAL NOT NULL,
        calibration_mngf REAL NOT NULL,
        ponton TEXT NOT NULL CHECK (ponton IN ('fixe', 'amovible')),
        note TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # V2.3 : snapshots successifs du system prompt édité par l'admin.
    """
    CREATE TABLE IF NOT EXISTS system_prompt_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_water_level_date_event ON water_level(date_event)",
]


# Singleton seed inserted by init_db if absent (idempotent).
_AI_POLICY_SEED = """
INSERT OR IGNORE INTO ai_policy (id, enabled, high_season_months, high_season_hours, low_season_hours)
VALUES (1, 1, '5,6,7,8', '6,10,14,18', '7')
"""

# V2.3 : default system prompt — doit rester en sync avec web/src/lib/db.ts.
DEFAULT_AI_SYSTEM_PROMPT = """Tu es l'assistant nautique du Lac des Saints Peyres (Tarn). Tu écris UNE phrase courte, en français, pour le propriétaire du bateau (son père). Le ton est celui d'un proche qui jette un œil au lac et résume la situation à voix haute.

LE LIEU
Lac de retenue hydroélectrique. Plein en juin / début juillet, baisse progressive à partir de mi-juillet (irrigation + production électrique). Fin août → septembre c'est la période critique. Le propriétaire est sur la partie peu profonde du lac.

LE BATEAU & LES PONTONS
Le bateau a un tirant d'eau (fourni dans le user prompt). Deux pontons existent :
- PONTON FIXE : ancré béton, articulé. Tient tant que le lac ne descend pas trop bas.
- PONTON AMOVIBLE : plateforme tractée à pied vers le trait d'eau quand le lac baisse.

Le user prompt indique quel ponton est actif. Tu ne donnes JAMAIS d'ordre, tu décris.

STYLE DE LA PHRASE (le plus important)
- COURT. Une phrase, naturelle, comme parlée. Pas un rapport.
- AUCUN chiffre type "666.99 mNGF" ni "tendance +0.049 m/jour". Si tu veux donner la profondeur, arrondis (ex : "2,40 m sous la coque", "il reste 2 m et demi"). Pas de décimales fines.
- Évite les chiffres quand un mot suffit ("stable depuis quelques jours" est mieux que "+0.04 m / 7j").
- Ne cite PAS les noms techniques des seuils admin entre guillemets ("Ponton fixe — partie 1 posée"). Si un seuil personnel est proche et ça vaut le coup, dis-le naturellement ("on approche du niveau où tu commences à t'inquiéter pour le ponton").
- Pas d'emoji. Pas de "✨" ni "💧" au début.
- Pas de jargon ("seuil de vigilance", "seuil critique"). Si tu dois en parler, traduis-le ("la coque touche le fond à 80 cm").

EXEMPLES DE BON TON
- "Encore 2,40 m sous la coque, ça remonte un peu depuis hier, large de marge."
- "Le niveau est stable depuis trois jours, rien à signaler."
- "Ça baisse doucement, plus qu'environ 1,50 m sous la coque — on est encore tranquilles mais surveille."
- "Profondeur correcte, presque inchangée par rapport à hier."

EXEMPLES À NE PAS REPRODUIRE
- "La profondeur sous la coque est de 2.40 m, en légère hausse récente (+0.11 m depuis hier; tendance 7 jours +0.049 m/jour)..." → trop long, trop chiffré.
- "...niveau du lac à 666.99 mNGF encore proche du repère personnel 'Ponton fixe — partie 1 posée' à 666.00 mNGF" → mNGF jamais affiché, pas de nom technique entre guillemets.

CE QUE TU NE FAIS JAMAIS
- Pas de prévision en jours ("dans 8 jours...").
- Pas d'ordre ("déplace le ponton").
- Pas de drame, pas d'effusion.

CONTINUITÉ
Les 7 dernières phrases sont fournies. Si rien n'a bougé, dis-le simplement. Une phrase identique à la précédente est mieux qu'une variation artificielle."""


# --- Connection helpers -----------------------------------------------------

@contextmanager
def connect(db_path: Path) -> Iterator[sqlite3.Connection]:
    """Yield a SQLite connection with row_factory=Row and WAL active."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _migrate_display_settings_v23(conn: sqlite3.Connection) -> None:
    """ALTER TABLE ADD COLUMN idempotent pour les DBs créées avant V2.3."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(display_settings)")}
    if "ponton_fixe_calibration_mngf" not in cols:
        conn.execute("ALTER TABLE display_settings ADD COLUMN ponton_fixe_calibration_mngf REAL")
        # data migration : si une calibration existait avant V2.3, on l'assume "fixe".
        conn.execute(
            "UPDATE display_settings SET ponton_fixe_calibration_mngf = ponton_calibration_mngf WHERE id = 1",
        )
    if "ponton_amovible_calibration_mngf" not in cols:
        conn.execute("ALTER TABLE display_settings ADD COLUMN ponton_amovible_calibration_mngf REAL")
    if "boat_draft_m" not in cols:
        conn.execute("ALTER TABLE display_settings ADD COLUMN boat_draft_m REAL NOT NULL DEFAULT 0.8")
    if "vigilance_margin_m" not in cols:
        conn.execute("ALTER TABLE display_settings ADD COLUMN vigilance_margin_m REAL NOT NULL DEFAULT 0.3")
    if "ai_system_prompt" not in cols:
        conn.execute("ALTER TABLE display_settings ADD COLUMN ai_system_prompt TEXT NOT NULL DEFAULT ''")


def init_db(db_path: Path) -> None:
    """Create all tables, indexes, and activate WAL. Idempotent."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        for stmt in SCHEMA:
            conn.execute(stmt)
        conn.execute(_AI_POLICY_SEED)
        _ensure_gpt_logs_system_prompt_column(conn)
        _migrate_display_settings_v23(conn)
        # Seed display_settings singleton + system prompt par défaut si vide.
        conn.execute(
            "INSERT OR IGNORE INTO display_settings (id, ai_system_prompt) VALUES (1, ?)",
            (DEFAULT_AI_SYSTEM_PROMPT,),
        )
        conn.execute(
            "UPDATE display_settings SET ai_system_prompt = ? WHERE id = 1 AND (ai_system_prompt IS NULL OR ai_system_prompt = '')",
            (DEFAULT_AI_SYSTEM_PROMPT,),
        )


# --- water_level operations -------------------------------------------------


def _parse_datetime(date_str: str, hour_str: str) -> datetime:
    """Parse 'dd-mm-YYYY' + 'HH:MM' into a datetime."""
    return datetime.strptime(f"{date_str} {hour_str}", "%d-%m-%Y %H:%M")


def measure_exists(db_path: Path, date_str: str, hour_str: str) -> bool:
    dt_iso = _parse_datetime(date_str, hour_str).strftime("%Y-%m-%d %H:%M:%S")
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM water_level WHERE datetime_event = ?", (dt_iso,)
        ).fetchone()
    return row is not None


def add_measure(
    db_path: Path,
    date_str: str,
    hour_str: str,
    value: float,
    unit: str,
) -> bool:
    """Insert a measure. Returns True if inserted, False if duplicate."""
    if measure_exists(db_path, date_str, hour_str):
        return False
    dt = _parse_datetime(date_str, hour_str)
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO water_level (date_event, datetime_event, value, unit)
            VALUES (?, ?, ?, ?)
            """,
            (
                dt.strftime("%Y-%m-%d"),
                dt.strftime("%Y-%m-%d %H:%M:%S"),
                float(value),
                unit,
            ),
        )
    return True


# --- empty_days operations --------------------------------------------------


def upsert_empty_day(db_path: Path, iso_date: str) -> None:
    """Insert an empty day, or increment attempts if it already exists."""
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO empty_days (date_event, first_attempted_at, last_attempted_at, attempts)
            VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
            ON CONFLICT(date_event) DO UPDATE SET
                last_attempted_at = CURRENT_TIMESTAMP,
                attempts = attempts + 1
            """,
            (iso_date,),
        )


def delete_empty_day(db_path: Path, iso_date: str) -> None:
    """Remove an empty-day marker (no-op if absent)."""
    with connect(db_path) as conn:
        conn.execute("DELETE FROM empty_days WHERE date_event = ?", (iso_date,))


def list_empty_days(db_path: Path) -> list[str]:
    """Return all empty-day markers as ISO date strings."""
    with connect(db_path) as conn:
        rows = conn.execute("SELECT date_event FROM empty_days").fetchall()
    return [r["date_event"] for r in rows]


# --- Missing-day computation ------------------------------------------------


def get_missing_days(
    db_path: Path,
    start_date: str,
    end_date: str | None = None,
) -> list[str]:
    """
    Return missing days (formatted dd-mm-YYYY) between start_date and end_date inclusive,
    excluding days already in water_level OR in empty_days.

    start_date / end_date: ISO 'YYYY-MM-DD'. If end_date is None, defaults to today.
    """
    if end_date is None:
        end_date = date.today().isoformat()

    query = """
    WITH RECURSIVE all_dates(d) AS (
      SELECT date(?)
      UNION ALL
      SELECT date(d, '+1 day') FROM all_dates WHERE d < date(?)
    )
    SELECT d FROM all_dates
    WHERE d NOT IN (SELECT DISTINCT date_event FROM water_level)
      AND d NOT IN (SELECT date_event FROM empty_days)
    ORDER BY d
    """
    with connect(db_path) as conn:
        rows = conn.execute(query, (start_date, end_date)).fetchall()
    return [
        datetime.strptime(r["d"], "%Y-%m-%d").strftime("%d-%m-%Y")
        for r in rows
    ]


# --- gpt_logs helpers -------------------------------------------------------


def _ensure_gpt_logs_system_prompt_column(conn: sqlite3.Connection) -> None:
    """Idempotent : ajoute la colonne system_prompt à gpt_logs (V2.3+)."""
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(gpt_logs)")}
    if "system_prompt" not in cols:
        conn.execute("ALTER TABLE gpt_logs ADD COLUMN system_prompt TEXT")


def log_gpt_call(
    db_path: Path,
    model: str,
    prompt: str,
    response: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    kind: str,
    system_prompt: str | None = None,
) -> None:
    """Persist an LLM call. `kind` est 'tendance'. `prompt` est le user prompt ;
    `system_prompt` (V2.3) est le system prompt envoyé en parallèle."""
    with connect(db_path) as conn:
        _ensure_gpt_logs_system_prompt_column(conn)
        conn.execute(
            """
            INSERT INTO gpt_logs (
                model, prompt, response,
                prompt_tokens, completion_tokens, total_tokens,
                type, system_prompt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (model, prompt, response, prompt_tokens, completion_tokens, total_tokens, kind, system_prompt),
        )


def get_last_gpt_response(db_path: Path, kind: str) -> str | None:
    """Return the most recent response of given kind, or None if no row matches."""
    with connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT response FROM gpt_logs
            WHERE type = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (kind,),
        ).fetchone()
    return row["response"] if row else None


# --- Read helpers for KPIs --------------------------------------------------


def load_all_measures(db_path: Path) -> list[dict]:
    """Return all water_level rows sorted by datetime_event ASC, as dicts."""
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT date_event, datetime_event, value, unit FROM water_level ORDER BY datetime_event"
        ).fetchall()
    return [dict(r) for r in rows]


# --- ai_policy helpers ------------------------------------------------------


def get_ai_policy(db_path: Path) -> dict:
    """Return the singleton ai_policy row as a dict (always exists post-init)."""
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM ai_policy WHERE id = 1").fetchone()
    return dict(row)


def save_ai_policy(
    db_path: Path,
    *,
    enabled: bool,
    high_season_months: str,
    high_season_hours: str,
    low_season_hours: str,
) -> None:
    """Update the singleton policy. Updates `updated_at`."""
    with connect(db_path) as conn:
        conn.execute(
            """
            UPDATE ai_policy
            SET enabled = ?,
                high_season_months = ?,
                high_season_hours = ?,
                low_season_hours = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (1 if enabled else 0, high_season_months, high_season_hours, low_season_hours),
        )


def mark_ai_run(
    db_path: Path,
    *,
    status: str,
    error: str | None = None,
) -> None:
    """Persist the outcome of an ai-refresher tick. status: 'ok'|'failed'|'skipped'."""
    with connect(db_path) as conn:
        conn.execute(
            """
            UPDATE ai_policy
            SET last_run_at = CURRENT_TIMESTAMP,
                last_run_status = ?,
                last_error = ?
            WHERE id = 1
            """,
            (status, error),
        )


# --- display_settings + calibration_history (V2.3) --------------------------


def get_display_settings(db_path: Path) -> dict:
    """Return the singleton display_settings row as a dict (always exists post-init)."""
    with connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT ponton_fixe_calibration_mngf, ponton_amovible_calibration_mngf,
                   boat_draft_m, vigilance_margin_m, ai_system_prompt, updated_at
            FROM display_settings WHERE id = 1
            """,
        ).fetchone()
    return dict(row)


def get_active_ponton(db_path: Path) -> str | None:
    """Return 'fixe' | 'amovible' | None — ponton du dernier étalonnage."""
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT ponton FROM calibration_history ORDER BY created_at DESC, id DESC LIMIT 1",
        ).fetchone()
    return row["ponton"] if row else None


def get_last_calibration(db_path: Path) -> dict | None:
    """Return the last calibration entry (any ponton), or None if no history."""
    with connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT id, lac_level_mngf, sonar_depth_m, calibration_mngf, ponton, note, created_at
            FROM calibration_history
            ORDER BY created_at DESC, id DESC LIMIT 1
            """,
        ).fetchone()
    return dict(row) if row else None


def get_threshold_lines(db_path: Path) -> list[dict]:
    """Return all active threshold_line rows sorted by value DESC."""
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT name, description, value FROM threshold_line WHERE is_deleted = 0 ORDER BY value DESC",
        ).fetchall()
    return [dict(r) for r in rows]


def get_recent_ai_messages(db_path: Path, kind: str, limit: int = 7) -> list[dict]:
    """Return the N most recent AI messages of given kind (newest first)."""
    with connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT response, created_at
            FROM gpt_logs
            WHERE type = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (kind, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def load_first_measure_per_day(db_path: Path) -> list[dict]:
    """Return one measure per day (the earliest of each date), as dicts."""
    query = """
    SELECT w.date_event, w.value
    FROM water_level w
    JOIN (
        SELECT date_event, MIN(datetime_event) AS min_dt
        FROM water_level
        GROUP BY date_event
    ) sub ON w.date_event = sub.date_event AND w.datetime_event = sub.min_dt
    ORDER BY w.date_event ASC
    """
    with connect(db_path) as conn:
        rows = conn.execute(query).fetchall()
    return [dict(r) for r in rows]
