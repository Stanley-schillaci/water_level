import sqlite3
import requests
import time
import random
import logging
import yaml
import pandas as pd
from datetime import datetime, timedelta
from bdd import init_db, add_measure, get_first_measure_data

DB_PATH = "niveau_eau.db"
IGNORE_DATES_FILE = "ignore_dates.yaml"

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(funcName)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
if not logger.handlers:
    logger.addHandler(handler)

def load_ignore_dates(filepath=IGNORE_DATES_FILE):
    """Load ignore dates from YAML file."""
    try:
        with open(filepath, "r") as f:
            config = yaml.safe_load(f)
        return config.get("ignore_dates", [])
    except Exception as e:
        logger.error(f"Error loading {filepath}: {e}")
        return []

def get_missing_days(db_path=DB_PATH, start_date="2021-07-07"):
    """Return missing days in 'dd-mm-YYYY' format."""
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        query = f"""
        WITH RECURSIVE all_dates(date) AS (
          SELECT date('{start_date}')
          UNION ALL
          SELECT date(date, '+1 day')
          FROM all_dates
          WHERE date < date('now')
        )
        SELECT date FROM all_dates
        WHERE date NOT IN (SELECT DISTINCT date_event FROM water_level);
        """
        cur.execute(query)
        missing = cur.fetchall()
    return [
        datetime.strptime(row[0], "%Y-%m-%d").strftime("%d-%m-%Y")
        for row in missing
    ]

def insert_measures_for_day(date_str, db_path=DB_PATH):
    """Fetch API data for a given day and insert into DB."""
    url = f"https://data.niv-eau.fr/hydro/lieu/198/{date_str}"
    headers = {"laetis": "Basic TGFldGlzTjF2ZWF1"}
    try:
        response = requests.get(url, headers=headers)
    except Exception as e:
        logger.error(f"API call error for {date_str}: {e}")
        return

    if response.status_code == 200:
        data = response.json()
        measures = data.get("chroniques", [])
        if not measures:
            logger.info(f"No measures for {date_str}.")
            return

        new_records = 0
        for m in measures:
            try:
                if add_measure(m["date"], m["heure"], m["valeur"], m["unite"], db_path):
                    new_records += 1
            except Exception as e:
                logger.error(f"Insertion error on {date_str} with {m}: {e}")
        logger.info(f"{new_records} new records for {date_str}")
    else:
        logger.error(f"API error {response.status_code} for {date_str}")

def update_missing_days(db_path=DB_PATH, start_date="2021-07-07"):
    """Update DB for missing days, current day, and last recorded day."""
    missing_days = get_missing_days(db_path, start_date)
    ignore_dates = load_ignore_dates()
    filtered_missing = [d for d in missing_days if d not in ignore_dates]

    for d in filtered_missing:
        logger.info(f"Inserting data for {d}")
        insert_measures_for_day(d, db_path)
        time.sleep(random.uniform(0.1, 0.5))

    today_str = datetime.now().strftime("%d-%m-%Y")
    if today_str not in ignore_dates:
        logger.info(f"Inserting/updating for today: {today_str}")
        insert_measures_for_day(today_str, db_path)
    else:
        logger.info(f"Today ({today_str}) is ignored.")

    df_first = get_first_measure_data(db_path)
    if not df_first.empty:
        df_first["Date"] = pd.to_datetime(df_first["date"])
        last_date = df_first["Date"].max().strftime("%d-%m-%Y")
        if last_date != today_str and last_date not in ignore_dates:
            logger.info(f"Refreshing last recorded day: {last_date}")
            insert_measures_for_day(last_date, db_path)
        else:
            logger.info("Last recorded day is current day or ignored.")

def update_db(db_path=DB_PATH):
    """Initialize and update the database."""
    init_db(db_path)
    update_missing_days(db_path)