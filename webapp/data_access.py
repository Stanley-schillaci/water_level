import sqlite3
import pandas as pd

def get_first_measure_data(db_path="niveau_eau.db"):
    """Return the first measure per day."""
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

def get_all_data(db_path="niveau_eau.db"):
    """Return all measures sorted by datetime."""
    with sqlite3.connect(db_path) as conn:
        query = "SELECT date_event, datetime_event, value FROM water_level ORDER BY datetime_event ASC"
        return pd.read_sql_query(query, conn)