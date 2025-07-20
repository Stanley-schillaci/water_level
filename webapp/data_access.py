# water_level/webapp/data_access.py

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
        ) sub ON w.date_event = sub.date_event
            AND w.datetime_event = sub.min_dt
        ORDER BY w.date_event ASC
        """
        return pd.read_sql_query(query, conn, parse_dates=["date"])

def get_all_data(db_path="niveau_eau.db"):
    """Return all measures sorted by datetime."""
    with sqlite3.connect(db_path) as conn:
        query = """
        SELECT date_event,
               datetime_event,
               value
        FROM water_level
        ORDER BY datetime_event ASC
        """
        return pd.read_sql_query(query, conn,
                                 parse_dates=["date_event", "datetime_event"])


# --- Threshold lines CRUD ---

def get_threshold_lines(db_path="niveau_eau.db"):
    """
    Return all non-deleted threshold lines, ordered by descending value.
    Chaque ligne comporte désormais une colonne `description`.
    """
    with sqlite3.connect(db_path) as conn:
        query = """
        SELECT id,
               name,
               description,
               value,
               color,
               dash_style,
               created_at,
               updated_at
        FROM threshold_line
        WHERE is_deleted = 0
        ORDER BY value DESC
        """
        return pd.read_sql_query(query, conn)

def create_threshold_line(
    name: str,
    description: str = "",
    value: float = 0.0,
    color: str = "#1f77b4",
    dash_style: str = "dash",
    db_path="niveau_eau.db"
):
    """Insert a new threshold line, avec description longue."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO threshold_line
              (name, description, value, color, dash_style)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name, description, value, color, dash_style)
        )
        conn.commit()

def update_threshold_line(
    id: int,
    name: str,
    description: str,
    value: float,
    color: str,
    dash_style: str,
    db_path="niveau_eau.db"
):
    """Update name, description, value, color and dash_style of an existing threshold line."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE threshold_line
            SET name        = ?,
                description = ?,
                value       = ?,
                color       = ?,
                dash_style  = ?,
                updated_at  = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (name, description, value, color, dash_style, id)
        )
        conn.commit()

def delete_threshold_line(id: int, db_path="niveau_eau.db"):
    """Soft-delete a threshold line (sets is_deleted flag)."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE threshold_line
            SET is_deleted = 1,
                deleted_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (id,)
        )
        conn.commit()