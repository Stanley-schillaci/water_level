"""HTTP client for the Laetis water-level API."""

from __future__ import annotations

import requests


class LaetisAPIError(RuntimeError):
    """Raised when the upstream API returns a non-2xx status."""


def fetch_day(
    date_str: str,
    *,
    base_url: str,
    auth_header: str,
    timeout_s: float = 15.0,
) -> list[dict]:
    """
    Fetch measurements for a given day (format 'dd-mm-YYYY').
    Returns the list of chroniques (possibly empty).
    Raises LaetisAPIError on HTTP failure.
    """
    url = f"{base_url}/{date_str}"
    headers = {"laetis": auth_header}
    response = requests.get(url, headers=headers, timeout=timeout_s)
    if response.status_code != 200:
        raise LaetisAPIError(
            f"Laetis API returned {response.status_code} for {date_str}: {str(response.text)[:200]}"
        )
    payload = response.json()
    return list(payload.get("chroniques", []))
