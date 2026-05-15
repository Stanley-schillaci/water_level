.PHONY: install test test-cov lint format scrape ai migrate clean

install:
	uv sync

test:
	uv run pytest -v

test-cov:
	uv run pytest --cov=lac_worker --cov-report=term-missing

lint:
	uv run ruff check .

format:
	uv run ruff format .

scrape:
	uv run lac-scraper

ai:
	uv run lac-ai-refresher

migrate:
	uv run lac-migrate

clean:
	rm -rf .pytest_cache .ruff_cache .coverage htmlcov
