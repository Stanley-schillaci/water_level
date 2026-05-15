"""Console-script entrypoints for the worker."""

from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv

from lac_worker.config import get_settings
from lac_worker.db import init_db
from lac_worker.scraper import run_scraper


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    load_dotenv()  # load .env if present (worker/.env in dev, systemd EnvFile in prod)


def scraper_main() -> int:
    _configure_logging()
    settings = get_settings()
    init_db(settings.db_path)
    summary = run_scraper(
        settings.db_path,
        start_date=settings.start_date,
        api_base=settings.api_base_url,
        auth=settings.api_auth,
    )
    logging.getLogger(__name__).info("scraper done: %s", summary)
    return 0


def ai_refresher_main() -> int:
    # Implemented in Task 17.
    raise NotImplementedError("ai_refresher_main is wired up in Task 17")


def migrate_main() -> int:
    # Implemented in Task 19.
    raise NotImplementedError("migrate_main is wired up in Task 19")
