from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from lac_worker.api import LaetisAPIError, fetch_day


def _ok(payload: dict, status: int = 200) -> Mock:
    resp = Mock()
    resp.status_code = status
    resp.json.return_value = payload
    return resp


def test_fetch_day_calls_correct_url_with_auth_header() -> None:
    with patch("lac_worker.api.requests.get") as mock_get:
        mock_get.return_value = _ok({"id": 198, "chroniques": []})

        fetch_day(
            "10-09-2024",
            base_url="https://data.niv-eau.fr/hydro/lieu/198",
            auth_header="Basic XYZ",
        )

        mock_get.assert_called_once()
        called_url = mock_get.call_args.args[0]
        assert called_url == "https://data.niv-eau.fr/hydro/lieu/198/10-09-2024"
        assert mock_get.call_args.kwargs["headers"] == {"laetis": "Basic XYZ"}


def test_fetch_day_returns_chroniques_list() -> None:
    payload = {
        "id": 198,
        "chroniques": [
            {"date": "10-09-2024", "heure": "14:20", "valeur": 665.9, "unite": "mNGF"},
        ],
    }
    with patch("lac_worker.api.requests.get") as mock_get:
        mock_get.return_value = _ok(payload)

        result = fetch_day("10-09-2024", base_url="x", auth_header="x")

        assert result == payload["chroniques"]


def test_fetch_day_returns_empty_list_when_no_chroniques() -> None:
    with patch("lac_worker.api.requests.get") as mock_get:
        mock_get.return_value = _ok({"id": 198, "chroniques": []})

        result = fetch_day("17-02-2025", base_url="x", auth_header="x")

        assert result == []


def test_fetch_day_raises_on_non_200() -> None:
    with patch("lac_worker.api.requests.get") as mock_get:
        mock_get.return_value = _ok({}, status=500)

        with pytest.raises(LaetisAPIError, match="500"):
            fetch_day("10-09-2024", base_url="x", auth_header="x")
