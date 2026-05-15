#!/usr/bin/env bash
#
# Bootstrap script for the OVH VPS Starter (Ubuntu 24.04 LTS).
# Idempotent — safe to re-run.
#
# Run as root on a fresh VPS:
#   curl -fsSL https://raw.githubusercontent.com/Stanley-schillaci/water_level/v2/infra/bootstrap.sh | bash
# or, after git clone:
#   sudo bash infra/bootstrap.sh
#
set -euo pipefail

LAC_USER="app"
LAC_HOME="/home/${LAC_USER}"
LAC_DATA_DIR="/var/lib/lac"
LAC_DB_PATH="${LAC_DATA_DIR}/niveau_eau.db"
LAC_OPT_DIR="/opt/lac"
LAC_WEB_DIR="${LAC_OPT_DIR}/web"
LAC_WORKER_DIR="${LAC_OPT_DIR}/worker"
LAC_REPO_DIR="${LAC_OPT_DIR}/repo"
LAC_LOG_DIR="/var/log/lac"

echo "==> apt update + base packages"
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates git rsync sqlite3 \
  caddy \
  python3 python3-pip python3-venv \
  build-essential

echo "==> install Node.js 22 LTS"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> create user '${LAC_USER}'"
if ! id "${LAC_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${LAC_USER}"
fi

echo "==> install uv (Python deps manager) for ${LAC_USER}"
sudo -u "${LAC_USER}" bash -c '
  if ! command -v uv >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
'

echo "==> create directories"
mkdir -p "${LAC_DATA_DIR}" "${LAC_OPT_DIR}" "${LAC_WEB_DIR}" "${LAC_WORKER_DIR}" "${LAC_REPO_DIR}" "${LAC_LOG_DIR}"
chown -R "${LAC_USER}:${LAC_USER}" "${LAC_DATA_DIR}" "${LAC_OPT_DIR}" "${LAC_LOG_DIR}"

echo "==> Caddyfile"
# Detect OVH-assigned reverse-DNS FQDN (e.g. vpsXXXXX.vps.ovh.net) or fall back to IP
HOSTNAME_GUESS="$(hostname -f 2>/dev/null || hostname || echo localhost)"
if [[ "${HOSTNAME_GUESS}" == "localhost" || -z "${HOSTNAME_GUESS}" ]]; then
  HOSTNAME_GUESS=":80"
fi
cat > /etc/caddy/Caddyfile <<EOF
${HOSTNAME_GUESS} {
    encode gzip
    reverse_proxy localhost:3000
}
EOF
systemctl enable --now caddy
systemctl reload caddy || true

echo "==> install systemd units (will activate after 'make deploy')"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "${SCRIPT_DIR}/systemd" ]]; then
  cp "${SCRIPT_DIR}/systemd/"*.service "${SCRIPT_DIR}/systemd/"*.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable lac-web.service || true
  systemctl enable lac-scraper.timer || true
  systemctl enable lac-ai.timer || true
fi

echo "==> Configure firewall (ufw)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow http
  ufw allow https
  ufw --force enable
fi

echo ""
echo "==> Bootstrap done."
echo ""
echo "Next steps (run from your Mac):"
echo "  1. scp niveau_eau.db ${LAC_USER}@<vps>:${LAC_DB_PATH}"
echo "  2. ssh ${LAC_USER}@<vps> 'chown ${LAC_USER}:${LAC_USER} ${LAC_DB_PATH}'"
echo "  3. From repo root: 'make deploy VPS=<user@host>'"
echo "  4. ssh ${LAC_USER}@<vps> 'cd ${LAC_WORKER_DIR} && LAC_DB_PATH=${LAC_DB_PATH} uv run lac-migrate'"
echo "  5. sudo systemctl start lac-web.service lac-scraper.timer lac-ai.timer"
echo ""
echo "VPS hostname for HTTPS: ${HOSTNAME_GUESS}"
