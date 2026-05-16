"""Console-script entrypoints for the worker."""

from __future__ import annotations

import argparse
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
    """AI refresher with policy-aware scheduling.

    Le timer systemd tape ici toutes les heures. On lit `ai_policy` et on
    décide soi-même si on génère. Avec --force, on bypass la policy."""
    _configure_logging()
    log = logging.getLogger(__name__)

    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Bypass policy and generate now")
    args = parser.parse_args()

    from openai import OpenAI

    from lac_worker.ai import run_ai_refresher
    from lac_worker.db import get_ai_policy, mark_ai_run
    from lac_worker.policy import now_paris, parse_db_datetime, should_generate_now

    settings = get_settings()
    init_db(settings.db_path)
    policy = get_ai_policy(settings.db_path)

    if not args.force:
        last_run = parse_db_datetime(policy.get("last_run_at"))
        ok, reason = should_generate_now(now_paris(), policy, last_run)
        if not ok:
            log.info("ai_refresher skipped: %s", reason)
            # Note: on n'écrit PAS dans last_run_at quand on skip,
            # sinon on perd la trace de la dernière vraie tentative.
            return 0
        log.info("ai_refresher generating: %s", reason)
    else:
        log.info("ai_refresher forced (bypass policy)")

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        result = run_ai_refresher(client=client, db_path=settings.db_path)
        mark_ai_run(settings.db_path, status="ok", error=None)
        log.info("ai_refresher done: %s", result)
        return 0
    except Exception as exc:  # noqa: BLE001
        err_str = f"{type(exc).__name__}: {exc}"
        mark_ai_run(settings.db_path, status="failed", error=err_str)
        log.exception("ai_refresher failed: %s", err_str)
        return 1


def migrate_main() -> int:
    _configure_logging()
    from lac_worker.migrate import migrate_v1_to_v2

    settings = get_settings()
    migrate_v1_to_v2(settings.db_path)
    return 0
