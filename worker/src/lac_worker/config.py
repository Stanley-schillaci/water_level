"""Settings loaded from environment variables (and .env when present)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    db_path: Path
    api_auth: str
    openai_api_key: str

    api_base_url: str = "https://data.niv-eau.fr/hydro/lieu/198"
    start_date: str = "2021-07-07"


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_settings() -> Settings:
    load_dotenv()  # loads .env if present, no-op otherwise
    db_path = Path(_require("LAC_DB_PATH")).resolve()
    return Settings(
        db_path=db_path,
        api_auth=_require("LAC_API_AUTH"),
        openai_api_key=_require("OPENAI_API_KEY"),
    )
