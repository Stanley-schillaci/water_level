import sqlite3
import logging
import pandas as pd
from datetime import datetime

logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(funcName)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
if not logger.handlers:
    logger.addHandler(handler)

DB_PATH = "niveau_eau.db"

def init_db(db_path=DB_PATH):
    """Initialize DB with a unique datetime_event."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS water_level (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_event DATE,
            datetime_event DATETIME,
            value REAL,
            unit TEXT,
            UNIQUE(datetime_event)
        )
        """)

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