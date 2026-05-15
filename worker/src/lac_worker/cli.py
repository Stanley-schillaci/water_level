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
    _configure_logging()
    from openai import OpenAI

    from lac_worker.ai import run_ai_refresher

    settings = get_settings()
    init_db(settings.db_path)
    client = OpenAI(api_key=settings.openai_api_key)
    result = run_ai_refresher(client=client, db_path=settings.db_path)
    logging.getLogger(__name__).info("ai_refresher done: %s", result)
    return 0


def migrate_main() -> int:
    _configure_logging()
    from lac_worker.migrate import migrate_v1_to_v2

    settings = get_settings()
    migrate_v1_to_v2(settings.db_path)
    return 0
