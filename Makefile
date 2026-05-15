# Lac des Saints Peyres V2 — deployment Makefile
#
# Usage from Mac:
#   make deploy VPS=app@vpsXXXXXXXX.vps.ovh.net
#   make logs VPS=...
#   make restart VPS=...
#
# VPS = ssh target (user@host). Make sure your SSH key is added to the VPS.

VPS ?= app@CHANGE_ME

WEB_LOCAL := web
WORKER_LOCAL := worker
WEB_REMOTE := /opt/lac/web
WORKER_REMOTE := /opt/lac/worker
DB_REMOTE := /var/lib/lac/niveau_eau.db

.PHONY: deploy deploy-web deploy-worker upload-db migrate restart logs status init-env

# ---- Deploy ----------------------------------------------------------------

deploy: deploy-worker deploy-web restart
	@echo "==> Deployment complete. Check status with 'make status VPS=$(VPS)'"

deploy-web:
	@echo "==> Rsync sources to $(VPS):$(WEB_REMOTE) (build runs on VPS for native bindings)"
	rsync -avz --delete \
		--exclude='.next' \
		--exclude='node_modules' \
		--exclude='.env*' \
		--exclude='coverage' \
		$(WEB_LOCAL)/ $(VPS):$(WEB_REMOTE)/
	@echo "==> npm ci + npm run build on VPS"
	ssh $(VPS) "cd $(WEB_REMOTE) && npm ci && LAC_DB_PATH=/var/lib/lac/niveau_eau.db npm run build"

deploy-worker:
	@echo "==> Rsync worker to $(VPS):$(WORKER_REMOTE)"
	rsync -avz --delete \
		--exclude='.venv' \
		--exclude='__pycache__' \
		--exclude='.pytest_cache' \
		--exclude='.ruff_cache' \
		--exclude='.env' \
		$(WORKER_LOCAL)/ $(VPS):$(WORKER_REMOTE)/
	@echo "==> uv sync on VPS"
	ssh $(VPS) "cd $(WORKER_REMOTE) && uv sync --frozen"

# ---- One-shot operations ---------------------------------------------------

upload-db:
	@echo "==> Uploading current niveau_eau.db to $(VPS):$(DB_REMOTE)"
	rsync -avz niveau_eau.db $(VPS):$(DB_REMOTE)
	ssh $(VPS) "sudo chown app:app $(DB_REMOTE) || true"

migrate:
	@echo "==> Running lac-migrate on VPS"
	ssh $(VPS) "cd $(WORKER_REMOTE) && uv run lac-migrate"

restart:
	@echo "==> Restart web + reload Caddy"
	ssh $(VPS) "sudo systemctl restart lac-web.service && sudo systemctl reload caddy"

init-env:
	@echo "==> Create .env files on VPS (interactive)"
	@echo "Edit /opt/lac/web/.env.production and /opt/lac/worker/.env on the VPS."
	ssh -t $(VPS) "sudo nano /opt/lac/web/.env.production && sudo nano /opt/lac/worker/.env"

# ---- Observability ---------------------------------------------------------

status:
	@ssh $(VPS) "systemctl status lac-web.service lac-scraper.timer lac-ai.timer --no-pager || true"

logs:
	ssh $(VPS) "journalctl -u lac-web.service -f"

logs-scraper:
	ssh $(VPS) "journalctl -u lac-scraper.service -f"

logs-ai:
	ssh $(VPS) "journalctl -u lac-ai.service -f"

# ---- Local helpers ---------------------------------------------------------

dev:
	@echo "==> Web on :3000"
	cd $(WEB_LOCAL) && npm run dev

scrape-local:
	cd $(WORKER_LOCAL) && uv run lac-scraper

ai-local:
	cd $(WORKER_LOCAL) && uv run lac-ai-refresher
