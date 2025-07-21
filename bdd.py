import sqlite3
import logging
import pandas as pd
from datetime import datetime
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(funcName)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
if not logger.handlers:
    logger.addHandler(handler)

DB_PATH = "niveau_eau.db"

def init_db(db_path: str = DB_PATH):
    """
    Initialise la base de données :
    - Création de la table water_level si elle n'existe pas encore.
    - Création de la table threshold_line pour les lignes de seuil, avec description longue.
    """
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()

        # Table des niveaux d'eau
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS water_level (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_event DATE,
            datetime_event DATETIME,
            value REAL,
            unit TEXT,
            UNIQUE(datetime_event)
        );
        """)

        # Table des lignes de seuil (horizontal lines), avec description longue
        cursor.execute("""
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
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS gpt_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT,
            prompt TEXT,
            response TEXT,
            prompt_tokens INTEGER,
            completion_tokens INTEGER,
            total_tokens INTEGER,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            type TEXT NOT NULL DEFAULT 'tendance'  -- nouveau champ
        );
        """)

        conn.commit()

def record_exists(date_str, hour_str, db_path=DB_PATH):
    """Check if record for given date/hour exists."""
    try:
        dt = datetime.strptime(f"{date_str} {hour_str}", "%d-%m-%Y %H:%M")
    except Exception as e:
        logger.error(f"Error parsing date/time: {e}")
        return False
    dt_iso = dt.strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM water_level WHERE datetime_event = ?", (dt_iso,))
        return cursor.fetchone() is not None

def add_measure(date_str, hour_str, value, unit, db_path=DB_PATH):
    """Add a measure if it does not already exist."""
    try:
        val = float(value)
    except Exception as e:
        logger.error(f"Error converting {value} to float: {e}")
        return False

    if not record_exists(date_str, hour_str, db_path):
        dt = datetime.strptime(f"{date_str} {hour_str}", "%d-%m-%Y %H:%M")
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO water_level (date_event, datetime_event, value, unit)
                VALUES (?, ?, ?, ?)
            """, (
                dt.strftime("%Y-%m-%d"),
                dt.strftime("%Y-%m-%d %H:%M:%S"),
                val,
                unit
            ))
            conn.commit()
        return True
    else:
        logger.debug(f"Record for {date_str} {hour_str} exists. Skipping.")
        return False

def get_all_measures(db_path=DB_PATH):
    """Return all water_level records."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM water_level ORDER BY datetime_event")
        return cursor.fetchall()

def export_db_to_csv(output_file, db_path=DB_PATH):
    """Export DB to CSV."""
    with sqlite3.connect(db_path) as conn:
        df = pd.read_sql_query("SELECT * FROM water_level ORDER BY datetime_event", conn)
    df.to_csv(output_file, index=False, encoding="utf-8")
    logger.info(f"Exported to CSV: {output_file}")

def get_first_measure_data(db_path=DB_PATH):
    """Return first measure per day based on earliest datetime_event."""
    with sqlite3.connect(db_path) as conn:
        query = """
        SELECT w.date_event AS date, w.value
        FROM water_level w
        JOIN (
            SELECT date_event, MIN(datetime_event) AS min_dt
            FROM water_level
            GROUP BY date_event
        ) sub ON w.date_event = sub.date_event AND w.datetime_event = sub.min_dt
        ORDER BY w.date_event ASC
        """
        return pd.read_sql_query(query, conn)
    
def log_gpt_call(model, prompt, response, prompt_tokens, completion_tokens, total_tokens, type="tendance", db_path=DB_PATH):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO gpt_logs (model, prompt, response, prompt_tokens, completion_tokens, total_tokens, type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            model,
            prompt,
            response,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            type
        ))
        conn.commit()

def should_generate_commentary(db_path=DB_PATH):
    """
    Autorise une génération 'tendance' si :
    - la dernière remonte à plus de 6h
    - et moins de 10 appels de ce type aujourd'hui
    Renvoie (bool, dernière réponse du type 'tendance').
    """
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()

        # 1. Dernière génération du type 'tendance'
        cursor.execute("""
            SELECT created_at, response
            FROM gpt_logs
            WHERE type = 'tendance'
            ORDER BY created_at DESC
            LIMIT 1
        """)
        row = cursor.fetchone()
        if row:
            last_time_str, last_response = row
            last_time = datetime.strptime(last_time_str, "%Y-%m-%d %H:%M:%S")
        else:
            return True, None  # jamais généré => autorisé

        # 2. Vérifier si au moins 6h se sont écoulées
        now = datetime.now()
        delta = now - last_time
        if delta < timedelta(hours=6):
            # 3. Vérifier s'il y a déjà 10 générations aujourd'hui (du même type)
            cursor.execute("""
                SELECT COUNT(*)
                FROM gpt_logs
                WHERE type = 'tendance'
                  AND DATE(created_at) = DATE('now')
            """)
            count_today = cursor.fetchone()[0]
            if count_today >= 10:
                return False, last_response
            else:
                return False, last_response

        return True, None
    
def should_generate_annual_comparison(db_path=DB_PATH):
    """
    Autorise une seule génération 'comparaison_annuelle' par jour.
    Renvoie (do_generate, last_comment).
    """
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT response
            FROM gpt_logs
            WHERE type = 'comparaison_annuelle'
              AND DATE(created_at) = DATE('now')
            ORDER BY created_at DESC
            LIMIT 1
        """)
        row = cursor.fetchone()
        if row:
            return False, row[0]
        else:
            return True, None