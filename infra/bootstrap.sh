#!/usr/bin/env bash
#
# Bootstrap script for the OVH VPS Starter (Ubuntu 24.04 LTS).
# Idempotent — safe to re-run.
#
# Run as root on a fresh VPS:
#   curl -fsSL https://raw.githubusercontent.com/Stanley-schillaci/water_level/v2/infra/bootstrap.sh | sudo bash
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
DEPLOY_USER="${SUDO_USER:-ubuntu}"

echo "==> apt update + base packages"
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates git rsync sqlite3 \
  caddy \
  python3 python3-pip python3-venv \
  build-essential \
  fail2ban

echo "==> set timezone to Europe/Paris"
timedatectl set-timezone Europe/Paris

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
# Make uv reachable system-wide so systemd units don't depend on app's $PATH
ln -sf "${LAC_HOME}/.local/bin/uv"  /usr/local/bin/uv
ln -sf "${LAC_HOME}/.local/bin/uvx" /usr/local/bin/uvx

echo "==> let deploy user (${DEPLOY_USER}) write to /opt/lac/{web,worker} via group"
# 'ubuntu' (or sudoer who rsyncs from Mac) must be in the 'app' group to push code.
if id "${DEPLOY_USER}" >/dev/null 2>&1 && [[ "${DEPLOY_USER}" != "${LAC_USER}" ]]; then
  usermod -aG "${LAC_USER}" "${DEPLOY_USER}"
fi

echo "==> create directories with proper ownership + sgid"
mkdir -p "${LAC_DATA_DIR}" "${LAC_OPT_DIR}" "${LAC_WEB_DIR}" "${LAC_WORKER_DIR}" "${LAC_REPO_DIR}" "${LAC_LOG_DIR}"

# /var/lib/lac : DB lives here, sgid so new files inherit group 'app'
chown -R "${LAC_USER}:${LAC_USER}" "${LAC_DATA_DIR}" "${LAC_LOG_DIR}"
chmod 2775 "${LAC_DATA_DIR}"

# /opt/lac/web and /opt/lac/worker : deploy user owns (so rsync works), group app (so app service can read)
# sgid bit ensures any new file/dir inherits group app
if id "${DEPLOY_USER}" >/dev/null 2>&1 && [[ "${DEPLOY_USER}" != "${LAC_USER}" ]]; then
  chown -R "${DEPLOY_USER}:${LAC_USER}" "${LAC_WEB_DIR}" "${LAC_WORKER_DIR}"
else
  chown -R "${LAC_USER}:${LAC_USER}" "${LAC_WEB_DIR}" "${LAC_WORKER_DIR}"
fi
chmod -R ug+rwX "${LAC_WEB_DIR}" "${LAC_WORKER_DIR}"
chmod g+s "${LAC_WEB_DIR}" "${LAC_WORKER_DIR}"

# Fix DB files if already present (re-run scenario or fresh upload)
if [[ -f "${LAC_DB_PATH}" ]]; then
  chown "${LAC_USER}:${LAC_USER}" "${LAC_DB_PATH}"* 2>/dev/null || true
  chmod 664 "${LAC_DB_PATH}"* 2>/dev/null || true
fi

echo "==> Caddyfile"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
  # On copie le Caddyfile versionné dans le repo (contient les hostnames de prod,
  # ex: gothis.duckdns.org + le reverse-DNS OVH en filet de sécurité).
  cp "${SCRIPT_DIR}/Caddyfile" /etc/caddy/Caddyfile
else
  # Fallback : si on bootstrap sans le repo (ex: curl direct), on génère un
  # Caddyfile minimal basé sur le hostname auto-détecté.
  HOSTNAME_GUESS="$(hostname -f 2>/dev/null || hostname || echo :80)"
  cat > /etc/caddy/Caddyfile <<EOF
${HOSTNAME_GUESS} {
    encode gzip
    reverse_proxy localhost:3000
}
EOF
fi
systemctl enable --now caddy
systemctl reload caddy || true

echo "==> install systemd units"
if [[ -d "${SCRIPT_DIR}/systemd" ]]; then
  cp "${SCRIPT_DIR}/systemd/"*.service "${SCRIPT_DIR}/systemd/"*.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable lac-web.service || true
  systemctl enable lac-scraper.timer || true
  systemctl enable lac-ai.timer || true
  systemctl enable lac-backup.timer || true
fi

echo "==> Configure firewall (ufw)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow http
  ufw allow https
  ufw --force enable
fi

echo "==> Harden SSH (disable password login, keep key auth only)"
# Only do this if the deploy user has at least one authorized key — otherwise we'd lock ourselves out
DEPLOY_HOME="$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)"
AUTHORIZED_KEYS="${DEPLOY_HOME}/.ssh/authorized_keys"
if [[ -s "${AUTHORIZED_KEYS}" ]]; then
  # OpenSSH applies first-match-wins for each directive — load our file BEFORE
  # 50-cloud-init.conf (which sets PasswordAuthentication yes on OVH images).
  cat > /etc/ssh/sshd_config.d/00-lac-hardening.conf <<'EOF'
# Lac V2 hardening — key auth only (must load before 50-cloud-init.conf)
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
EOF
  # Also neutralize the cloud-init default if it conflicts (belt + suspenders)
  if [[ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]]; then
    sed -i 's/^PasswordAuthentication[[:space:]]\+yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf
  fi
  # Drop any older 99- variant from previous runs
  rm -f /etc/ssh/sshd_config.d/99-lac-hardening.conf
  # Validate config before applying
  if sshd -t; then
    systemctl reload ssh || systemctl reload sshd || true
    echo "    SSH password login disabled (key auth only)."
  else
    echo "    !! sshd config invalid, NOT reloading. Inspect /etc/ssh/sshd_config.d/00-lac-hardening.conf"
    rm -f /etc/ssh/sshd_config.d/00-lac-hardening.conf
  fi
else
  echo "    !! ${DEPLOY_USER} has no authorized_keys — skipping SSH hardening to avoid lockout."
  echo "    Once your SSH key is installed, re-run this script."
fi

echo "==> Enable fail2ban (jails SSH brute-force)"
if [[ ! -f /etc/fail2ban/jail.local ]]; then
  cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
EOF
fi
systemctl enable --now fail2ban
systemctl restart fail2ban

echo ""
echo "==> Bootstrap done."
echo ""
echo "Next steps (run from your Mac):"
echo "  1. scp niveau_eau.db ${DEPLOY_USER}@<vps>:/tmp/niveau_eau.db"
echo "  2. ssh ${DEPLOY_USER}@<vps> 'sudo mv /tmp/niveau_eau.db ${LAC_DB_PATH} && sudo chown ${LAC_USER}:${LAC_USER} ${LAC_DB_PATH}'"
echo "  3. From repo root: 'make deploy VPS=<ssh-alias>'"
echo "  4. ssh <ssh-alias> 'cd ${LAC_WORKER_DIR} && LAC_DB_PATH=${LAC_DB_PATH} /usr/local/bin/uv run lac-migrate'"
echo "  5. sudo systemctl start lac-web.service lac-scraper.timer lac-ai.timer lac-backup.timer"
echo ""
echo "VPS hostname for HTTPS: ${HOSTNAME_GUESS}"
