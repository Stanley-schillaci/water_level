# 05 — Infrastructure

Tout ce qui tourne sur le VPS OVH : provisioning, services systemd, reverse proxy, firewall, fail2ban.

---

## Le VPS OVH

- **Offre** : OVH VPS-1 (~6,62€ TTC/mois — l'offre VPS Starter à 4,20€ n'existe plus depuis le repackaging OVH)
- **Specs** : 4 vCores, 8 GB RAM, 75 GB SSD, trafic illimité, sauvegarde auto OVH 1 jour incluse
- **Datacenter** : Roubaix (RBX), France
- **OS** : Ubuntu 24.04 LTS (LTS jusqu'à avril 2029)
- **FQDN** : `vps-9bc559d8.vps.ovh.net` (reverse DNS attribué par OVH, gratuit)
- **Engagement** : mensuel (résiliable à tout moment)

> Les specs sont **largement surdimensionnées** pour notre usage (Next.js consomme ~150 MB de RAM, le worker Python idem). Marge confortable si on ajoute d'autres projets perso plus tard.

---

## Le user `app`

Toute la stack tourne sous l'utilisateur **`app`** (créé par `bootstrap.sh`), **pas root**.

- **Home** : `/home/app/`
- **`uv`** installé pour `app` : `/home/app/.local/bin/uv`, symlinké en `/usr/local/bin/uv`
- **Groupe `app`** : le user `ubuntu` (qui fait les déploiements) est ajouté à ce groupe pour pouvoir écrire dans `/opt/lac/web` et `/opt/lac/worker`

**Pourquoi pas root ?** Bonne pratique sécurité standard. Si Next.js a une faille remote-code-execution, l'attaquant a les droits `app` (limité) et pas `root`.

---

## Arborescence sur le VPS

```
/var/lib/lac/                  ← données persistantes (DB + backups)
├── niveau_eau.db
├── niveau_eau.db-wal
├── niveau_eau.db-shm
├── .uv-cache/                 ← cache uv (forcé ici car /home/app est read-only via ProtectHome)
└── backups/
    ├── niveau_eau-20260515.db
    ├── niveau_eau-20260514.db
    └── ...

/opt/lac/                      ← code applicatif (deploy rsync depuis Mac)
├── web/                       ← Next.js complet
│   ├── .env.production
│   ├── .next/                 ← build
│   ├── node_modules/
│   └── ... (sources)
└── worker/                    ← Python complet
    ├── .env
    ├── .venv/
    └── ... (sources)

/etc/systemd/system/
├── lac-web.service
├── lac-scraper.service
├── lac-scraper.timer
├── lac-ai.service
├── lac-ai.timer
├── lac-backup.service
└── lac-backup.timer

/etc/caddy/Caddyfile
/etc/ssh/sshd_config.d/00-lac-hardening.conf
/etc/fail2ban/jail.local
```

---

## Caddy (reverse proxy + TLS)

`Caddy` écoute sur les ports 80 et 443, gère TLS automatique via Let's Encrypt, et forwarde tout vers `localhost:3000` (Next.js).

**Configuration totale** (3 lignes dans `/etc/caddy/Caddyfile`) :
```
vps-9bc559d8.vps.ovh.net {
    encode gzip
    reverse_proxy localhost:3000
}
```

**Ce que Caddy fait automatiquement** :
- ✅ Demande un certificat Let's Encrypt à la première requête HTTPS
- ✅ Renouvelle le certificat 30 jours avant expiration (background)
- ✅ Redirige HTTP (80) → HTTPS (443)
- ✅ Servit en HTTP/2 + HTTP/3 (QUIC)
- ✅ Compression gzip

**Si tu ajoutes un domaine perso plus tard**, ajoute juste un bloc :
```
lac.mondomaine.fr {
    encode gzip
    reverse_proxy localhost:3000
}
```
Et `systemctl reload caddy`. Caddy demande le cert tout seul.

---

## systemd : 7 units pour orchestrer

### Vue d'ensemble

| Unit | Type | Activation |
|---|---|---|
| `lac-web.service` | service (daemon) | au démarrage du système |
| `lac-scraper.service` | service (oneshot) | déclenché par le timer |
| `lac-scraper.timer` | timer | toutes les 20 min |
| `lac-ai.service` | service (oneshot) | déclenché par le timer |
| `lac-ai.timer` | timer | toutes les heures (xx:55) — la policy décide si on génère |
| `lac-backup.service` | service (oneshot) | déclenché par le timer |
| `lac-backup.timer` | timer | chaque jour à 02:05 |

### `lac-web.service` (Next.js daemon)

```ini
[Unit]
Description=Lac des Saints Peyres — Next.js web app
After=network.target

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/opt/lac/web
EnvironmentFile=/opt/lac/web/.env.production
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=LAC_DB_PATH=/var/lib/lac/niveau_eau.db
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Hardening
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true
ReadWritePaths=/var/lib/lac

[Install]
WantedBy=multi-user.target
```

**Points clés** :
- `Type=simple` + `Restart=on-failure` : si Next.js crash, systemd le relance auto (max sans rate limit)
- `EnvironmentFile=...env.production` : charge les secrets (ADMIN_PASSWORD, SESSION_PASSWORD)
- **Hardening systemd** :
  - `ProtectSystem=full` : `/usr`, `/boot`, `/etc` en read-only pour ce process
  - `ProtectHome=true` : `/home` invisible pour ce process
  - `ReadWritePaths=/var/lib/lac` : autorise écriture DB
  - `NoNewPrivileges=true` : impossible d'escalader via setuid

### `lac-scraper.service` + `.timer`

**Le service** :
```ini
[Service]
Type=oneshot
User=app
Group=app
WorkingDirectory=/opt/lac/worker
EnvironmentFile=/opt/lac/worker/.env
Environment=LAC_DB_PATH=/var/lib/lac/niveau_eau.db
Environment=UV_CACHE_DIR=/var/lib/lac/.uv-cache
ExecStart=/home/app/.local/bin/uv run --no-sync lac-scraper
```

`Type=oneshot` : le service termine après l'exécution (pas de daemon).

**Le timer** :
```ini
[Timer]
OnBootSec=2min
OnUnitActiveSec=20min
RandomizedDelaySec=30s
Persistent=true
Unit=lac-scraper.service

[Install]
WantedBy=timers.target
```

- `OnBootSec=2min` : 1ère exécution 2 min après le boot du VPS
- `OnUnitActiveSec=20min` : ensuite, toutes les 20 min après la dernière exécution
- `RandomizedDelaySec=30s` : jitter aléatoire ±30s pour éviter de cogner l'API Laetis pile à HH:00, HH:20, HH:40 (politesse réseau)
- `Persistent=true` : si le VPS était down au moment théorique d'exécution, on rattrape au reboot

### `lac-ai.service` + `.timer`

Pareil que scraper mais :
- `ExecStart=lac-ai-refresh` (au lieu de `lac-scraper`)
- `Timer: OnCalendar=*-*-* *:55:00` (toutes les heures à xx:55, heure locale Paris)
- `RandomizedDelaySec=2min` pour éviter de cogner OpenAI exactement à xx:55

**Pourquoi toutes les heures ?** Le script ne génère pas systématiquement : il consulte la table `ai_policy` et le module `worker/policy.py` pour décider, selon le mois et l'heure courants en heure de Paris. Cela permet à l'admin de régler la cadence depuis le panel web (cf [04-frontend.md](04-frontend.md)) sans toucher au timer systemd.

**Cadence par défaut** :
- Haute saison (mai → août) : 4×/jour à 06h, 10h, 14h, 18h
- Basse saison (reste de l'année) : 1×/jour à 07h
- Kill switch global (`enabled=0`) pour tout désactiver

**`--force`** : le bouton "Régénérer maintenant" du panel admin spawn `lac-ai-refresh --force` qui bypass la policy. Rate-limité 1×/5 min côté API Next.js.

### `lac-backup.service` + `.timer`

```ini
[Service]
Type=oneshot
ExecStart=/bin/bash -c '\
  DEST="/var/lib/lac/backups"; \
  mkdir -p "$DEST"; \
  sqlite3 /var/lib/lac/niveau_eau.db ".backup $DEST/niveau_eau-$(date +%%Y%%m%%d).db" && \
  ls -1t $DEST/niveau_eau-*.db | tail -n +8 | xargs -r rm -f \
'
```

- `sqlite3 .backup` : snapshot cohérent même si écriture en cours
- `tail -n +8 | xargs -r rm -f` : garde les 7 plus récents

Lancé chaque nuit à **02:05** (heure creuse, pas pendant le scraping).

---

## Firewall ufw

Configuré par `bootstrap.sh` :

```
ufw allow OpenSSH       # port 22
ufw allow http          # port 80 (Caddy redirige vers 443)
ufw allow https         # port 443
ufw --force enable
```

**Ports ouverts** : 22, 80, 443. **Tout le reste est bloqué** (Postgres, Redis, MySQL : aucun risque d'exposition accidentelle).

---

## SSH hardening

Configuration custom dans `/etc/ssh/sshd_config.d/00-lac-hardening.conf` (le préfixe `00-` garantit la lecture **avant** `50-cloud-init.conf` qui mettait `PasswordAuthentication yes` par défaut chez OVH) :

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
```

**Résultat** :
- 🚫 Login par mot de passe **désactivé** (sur tous les comptes)
- ✅ Login par clé SSH **autorisé**
- 🚫 Login root par mot de passe **interdit**
- ✅ Login root par clé **autorisé** (utile pour les ops critiques)

**Le bootstrap.sh skip ce hardening s'il n'y a pas d'`authorized_keys`** sur le compte deploy : évite de se lock out d'un fresh VPS.

**Premier déploiement** :
1. Connexion initiale par mdp (OVH te donne un mdp temporaire à changer)
2. `ssh-copy-id` pour pousser la clé publique
3. Re-run de `bootstrap.sh` (qui détecte la clé et applique le hardening)

---

## fail2ban

Installé et configuré par `bootstrap.sh` :

```ini
# /etc/fail2ban/jail.local
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
```

Si une IP rate **5 tentatives de connexion SSH ratées en 10 minutes**, fail2ban la **bannit pendant 1 heure** (au niveau iptables).

```bash
# Voir les IPs bannies en temps réel
ssh lac "sudo fail2ban-client status sshd"
```

> Combiné avec `PasswordAuthentication no`, c'est ceinture + bretelles. Un bot ne peut **physiquement pas** se connecter sans la clé privée, mais fail2ban bloque quand même les scanners par principe.

---

## Timezone

Réglée à `Europe/Paris` (UTC+1 hiver / UTC+2 été) par `bootstrap.sh` :
```bash
timedatectl set-timezone Europe/Paris
```

Important pour :
- L'affichage des dates dans l'UI ("Mis à jour il y a N min")
- L'heure des timers (`lac-ai.timer` à xx:55, `lac-backup.timer` à 02:05 — tous en heure de Paris)
- Les heures cochées dans `ai_policy` (interprétées en heure de Paris par `worker/policy.py` via `zoneinfo`)
- Les logs systemd (`journalctl` affiche en heure locale)

**SQLite et UTC** : `CURRENT_TIMESTAMP` écrit en UTC quel que soit le timezone système. Toute logique qui mélange `CURRENT_TIMESTAMP` avec `datetime.now()` doit faire la conversion explicite (cf `worker/policy.py::_utc_to_paris`).

---

## Provisioning : `bootstrap.sh`

**Idempotent**. Tu peux le relancer 10 fois sans casser quoi que ce soit. Il :

1. `apt update && apt install` : caddy, sqlite3, python3, build-essential, fail2ban
2. Set timezone Europe/Paris
3. Install Node.js 22 LTS (via NodeSource)
4. Crée le user `app` + install `uv` pour lui
5. Symlink `uv` et `uvx` dans `/usr/local/bin` (système-wide)
6. Add deploy user (`ubuntu`) au groupe `app`
7. Crée les répertoires `/var/lib/lac` (sgid, group app) et `/opt/lac/{web,worker}` (ubuntu:app, sgid, group-writable)
8. Fix ownership/perms de la DB si déjà présente
9. Écrit le `Caddyfile` (avec le FQDN auto-détecté)
10. Copie les 7 unités systemd dans `/etc/systemd/system/` et les `enable`
11. Configure ufw (ports 22/80/443)
12. **Hardening SSH** : crée `00-lac-hardening.conf` + neutralise `50-cloud-init.conf` (sed)
13. Active fail2ban

**Toutes les modifications faites en cours de déploiement initial sont maintenant dans le script** (cf. [09-history.md](09-history.md)). Si tu provisionnes un nouveau VPS dans 1 an, un seul `bash bootstrap.sh` suffit.

---

## Healthcheck

```bash
curl -s https://vps-9bc559d8.vps.ovh.net/api/health
```

Réponse JSON :
```json
{
  "status": "ok",
  "last_measure_age_min": 6,
  "db_size_mb": 17
}
```

- Si dernière mesure < 120 min : `status: "ok"`, HTTP **200**
- Si dernière mesure > 120 min : `status: "stale"`, HTTP **503**

C'est cet endpoint qui est surveillé par **UptimeRobot** (compte free, monitor toutes les 5 min, alerte email).

---

## Pour aller plus loin

- Comment déployer / mettre à jour : [06-operations.md](06-operations.md)
- Détail du modèle de sécurité : [07-security.md](07-security.md)
