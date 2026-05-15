# 06 — Operations & Runbook

Procédures opérationnelles : déploiement, monitoring, debug, rollback. Si tu reviens dans 6 mois pour fixer un truc, lis ce fichier en premier.

---

## Prérequis sur ton Mac

### 1. Clé SSH

Tu as 2 clés dans `~/.ssh/` :
- `id_rsa` — clé Silae (boulot)
- `id_ed25519_perso` — **clé perso, à utiliser pour ce projet**

### 2. Alias SSH

Le fichier `~/.ssh/config` contient :
```
Host lac
    HostName vps-9bc559d8.vps.ovh.net
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519_perso
    IdentitiesOnly yes
```

Donc tu peux faire `ssh lac` au lieu de `ssh -i ~/.ssh/id_ed25519_perso ubuntu@vps-...`. Pratique.

### 3. Outils requis

- `make` (déjà installé sur Mac)
- `node 22+` + `npm` (pour le build local Next.js)
- `uv` + Python 3.12+ (pour le worker local)
- `git`, `ssh`, `rsync` (built-in macOS)

---

## Déploiement courant

**Depuis le repo root sur ton Mac**, après un commit :

```bash
make deploy VPS=lac
```

Cette commande :
1. Rsync `worker/` vers `/opt/lac/worker/` (exclut `.venv`, `__pycache__`, `.env`)
2. Sur le VPS : `uv sync --frozen` (réinstalle les deps Python depuis le lockfile)
3. Rsync `web/` vers `/opt/lac/web/` (exclut `.next`, `node_modules`, `.env*`)
4. Sur le VPS : `npm ci && LAC_DB_PATH=/var/lib/lac/niveau_eau.db npm run build`
5. Sur le VPS : `systemctl restart lac-web.service && systemctl reload caddy`

**Durée** : ~3-5 min (essentiellement le build Next.js sur le VPS).

### Si tu modifies juste le worker

```bash
make deploy-worker VPS=lac
```

Pas de restart nécessaire — le worker est `Type=oneshot`, la prochaine exécution du timer utilisera le nouveau code.

### Si tu modifies juste le web

```bash
make deploy-web VPS=lac
```

Le service `lac-web.service` est restart automatiquement à la fin (`make restart` enchaîné).

---

## Premier déploiement sur un VPS neuf

Cas : tu re-provisionnes (le VPS actuel meurt, ou tu en commandes un autre).

### 0. Commander le VPS

OVHcloud → VPS-1 (~6,62€/mois) → Ubuntu 24.04 LTS → Roubaix → mensuel → ajouter ta clé SSH publique si possible (sinon OVH te donne un mdp temporaire par email).

### 1. Premier login + SSH key

```bash
# Si OVH t'a donné un mdp :
ssh ubuntu@<vps-fqdn>
# Système te force à changer le mdp au premier login → suivre le prompt

# Ensuite, depuis ton Mac :
ssh-copy-id -i ~/.ssh/id_ed25519_perso.pub ubuntu@<vps-fqdn>

# Vérifier que ça marche sans mdp :
ssh ubuntu@<vps-fqdn> "echo OK"
```

### 2. Mettre à jour `~/.ssh/config`

Remplace le `HostName` dans l'alias `Host lac` par le nouveau FQDN.

### 3. Bootstrap

```bash
ssh lac "sudo apt-get install -y git && sudo git clone -b v2 https://github.com/Stanley-schillaci/water_level.git /tmp/water_level && sudo bash /tmp/water_level/infra/bootstrap.sh"
```

Le bootstrap installe tout (Caddy, Node, Python, uv, systemd units, ufw, fail2ban, SSH hardening, etc.).

### 4. Mettre à jour le `Caddyfile` avec le nouveau FQDN

(normalement le bootstrap l'a déjà fait via `hostname -f`, vérifie quand même)

```bash
ssh lac "sudo cat /etc/caddy/Caddyfile"
```

### 5. Pousser la DB

```bash
# Depuis le Mac, dans le repo root
git show v1.0.0:niveau_eau.db > niveau_eau.db   # si pas déjà fait
make upload-db VPS=lac
```

### 6. Migrer V1 → V2

```bash
ssh lac "cd /opt/lac/worker && /usr/local/bin/uv run lac-migrate"
```

### 7. Configurer les `.env` sur le VPS

```bash
ssh lac
sudo nano /opt/lac/worker/.env
# Contenu :
# LAC_DB_PATH=/var/lib/lac/niveau_eau.db
# LAC_API_AUTH=Basic TGFldGlzTjF2ZWF1
# OPENAI_API_KEY=sk-... (ta vraie clé perso)

sudo nano /opt/lac/web/.env.production
# Contenu :
# LAC_DB_PATH=/var/lib/lac/niveau_eau.db
# ADMIN_PASSWORD=gothis1234
# SESSION_PASSWORD=<32 chars hex, généré avec `openssl rand -hex 32`>
# NODE_ENV=production
# PORT=3000

sudo chown app:app /opt/lac/worker/.env /opt/lac/web/.env.production
sudo chmod 600 /opt/lac/worker/.env /opt/lac/web/.env.production
exit
```

### 8. Deploy + start

```bash
make deploy VPS=lac
ssh lac "sudo systemctl start lac-web.service lac-scraper.timer lac-ai.timer lac-backup.timer"
```

### 9. Smoke test

```bash
curl -s https://<vps-fqdn>/api/health
# → {"status":"ok","last_measure_age_min":N,"db_size_mb":17}
```

---

## Monitoring & logs

### Healthcheck en live

```bash
curl https://gothis.duckdns.org/api/health
```

HTTP 200 = OK. HTTP 503 = dernière mesure > 120 min (scraping en panne ou API Laetis down).

### UptimeRobot

Compte gratuit, monitor toutes les 5 min, alerte email si HTTP != 200. Configuration manuelle 1× : https://uptimerobot.com → Add monitor → HTTPS → URL `https://gothis.duckdns.org/api/health`.

### Logs systemd

```bash
# Web (Next.js)
make logs VPS=lac
# ou
ssh lac "sudo journalctl -u lac-web.service -f"

# Worker scraper
make logs-scraper VPS=lac
ssh lac "sudo journalctl -u lac-scraper.service --since '1 hour ago'"

# Worker AI
make logs-ai VPS=lac

# Tout
ssh lac "sudo journalctl --since '1 hour ago' -u 'lac-*.service'"
```

### État des services

```bash
make status VPS=lac

# Sortie :
# ● lac-web.service - Lac des Saints Peyres — Next.js web app
#      Active: active (running) since ...
# ● lac-scraper.timer ...
# ● lac-ai.timer ...
```

### Prochaines exécutions des timers

```bash
ssh lac "systemctl list-timers lac-* --no-pager"
```

---

## Debug : "ça marche plus"

### Niveau 1 — vérifier le healthcheck

```bash
curl -i https://gothis.duckdns.org/api/health
```

- **HTTP 200 OK** → tout va bien
- **HTTP 503** → scraping en retard, voir niveau 2
- **HTTP 502** → Next.js down, voir niveau 3
- **HTTP 504 / timeout** → Caddy down ou VPS injoignable, voir niveau 4
- **Connection refused** → firewall ou VPS éteint

### Niveau 2 — scraping bloqué

```bash
# Logs récents
ssh lac "sudo journalctl -u lac-scraper.service --since '2 hours ago' | tail -30"

# Forcer un run manuel
ssh lac "sudo systemctl start lac-scraper.service"

# Vérifier le résultat
ssh lac "sudo -u app sqlite3 /var/lib/lac/niveau_eau.db 'SELECT MAX(datetime_event) FROM water_level;'"
```

**Causes habituelles** :
- L'API Laetis est down (chercher `LaetisAPIError` dans les logs) → attendre
- Permission denied sur la DB → `ssh lac "sudo chown app:app /var/lib/lac/niveau_eau.db*"`
- uv plante (cache corrompu) → `ssh lac "sudo rm -rf /var/lib/lac/.uv-cache && sudo systemctl start lac-scraper.service"`

### Niveau 3 — Next.js down

```bash
ssh lac "sudo systemctl status lac-web.service"
ssh lac "sudo journalctl -u lac-web.service --since '15 min ago' | tail -50"
```

**Causes habituelles** :
- Erreur SQLite (la DB n'existe pas ou perms) → vérifier `/var/lib/lac/niveau_eau.db` permissions
- `.env.production` manquant ou cassé → vérifier `ssh lac "sudo cat /opt/lac/web/.env.production"`
- Plantage runtime (un bug du code) → lire les logs, identifier la route, fix + redeploy
- Out of memory (peu probable avec 8 GB) → `ssh lac "free -h && top -bn1 | head"`

```bash
# Redémarrer
ssh lac "sudo systemctl restart lac-web.service"
```

### Niveau 4 — VPS injoignable

```bash
ping vps-9bc559d8.vps.ovh.net
```

Si pas de réponse :
1. Vérifier l'état du VPS dans le manager OVH → VPS → tableau de bord
2. Si "En cours de maintenance" → attendre
3. Si "Down" → bouton "Redémarrer" dans le manager OVH
4. Si "Suspendu" → vérifier ta facturation OVH

---

## Rollback

### Rollback du code (la dernière deploy a cassé un truc)

```bash
# Identifier le commit qui marchait
git log --oneline -10

# Revenir
git checkout <commit-sha>
make deploy VPS=lac

# Une fois validé que ça marche, revenir sur v2
git checkout v2
```

### Rollback complet vers la V1 Streamlit Cloud

Tu peux laisser la V1 Streamlit Cloud comme **filet de sécurité** jusqu'à J+30. Pour basculer dessus :

1. Communique à papa la vieille URL : `https://gothis.streamlit.app/`
2. La V1 Streamlit a sa propre DB (séparée de la V2 VPS) — Streamlit Cloud l'a maintenue ingérée si l'app y est encore déployée
3. Le VPS reste up mais inutilisé (tu peux le destroyer si confiance ferme : il sera tagué pour redéployer plus tard)

### Rollback de la DB depuis un backup

```bash
ssh lac
sudo systemctl stop lac-web.service lac-scraper.timer

ls /var/lib/lac/backups/         # voir les backups dispo (7 derniers)
sudo cp /var/lib/lac/backups/niveau_eau-20260512.db /var/lib/lac/niveau_eau.db
sudo chown app:app /var/lib/lac/niveau_eau.db
sudo rm -f /var/lib/lac/niveau_eau.db-wal /var/lib/lac/niveau_eau.db-shm  # repartir clean

sudo systemctl start lac-web.service lac-scraper.timer
```

---

## Mise à jour OS du VPS

```bash
ssh lac "sudo apt update && sudo apt upgrade -y && sudo reboot"
# Attendre 1 min
curl -i https://gothis.duckdns.org/api/health
```

**Fréquence recommandée** : tous les 2-3 mois pour les patchs sécurité.

---

## Changer un secret

### `ADMIN_PASSWORD`

```bash
ssh lac "sudo sed -i 's|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=NouveauMdp|' /opt/lac/web/.env.production && sudo systemctl restart lac-web.service"
```

Les sessions admin actuelles restent valides (le cookie est signé avec `SESSION_PASSWORD`, pas avec `ADMIN_PASSWORD`).

### `SESSION_PASSWORD`

```bash
NEW=$(openssl rand -hex 32)
ssh lac "sudo sed -i 's|^SESSION_PASSWORD=.*|SESSION_PASSWORD=$NEW|' /opt/lac/web/.env.production && sudo systemctl restart lac-web.service"
```

⚠️ Cela invalide **toutes** les sessions admin actuelles (papa ou toi devra retaper `ADMIN_PASSWORD`).

### `OPENAI_API_KEY`

```bash
ssh lac "sudo sed -i 's|^OPENAI_API_KEY=.*|OPENAI_API_KEY=sk-NouvelleClef|' /opt/lac/worker/.env"
# Tester
ssh lac "sudo systemctl start lac-ai.service && sleep 4 && sudo journalctl -u lac-ai.service --no-pager -n 5"
```

---

## Vérifier les coûts OpenAI

```bash
ssh lac "sudo -u app sqlite3 /var/lib/lac/niveau_eau.db '
  SELECT
    substr(created_at, 1, 7) AS mois,
    COUNT(*) AS calls,
    SUM(total_tokens) AS tokens
  FROM gpt_logs
  GROUP BY mois
  ORDER BY mois DESC
  LIMIT 6;
'"
```

À ~$2.5/M input + $10/M output (tarif GPT-4o mai 2026), on est largement sous 0,10€/mois.

---

## Cleanup une fois la V2 stable (~ J+30)

1. Si papa est content :
   - **Pause** ou **delete** de l'app Streamlit Cloud
   - Garder le repo + le tag `v1.0.0` (rollback toujours possible)

2. Merger `v2` → `main` :
   ```bash
   git checkout main
   git merge v2 --no-ff
   git push origin main
   git tag -a v2.0.0 -m "V2 production stable on OVH VPS-1"
   git push origin v2.0.0
   ```

3. La branche `v2` peut être supprimée (`git branch -d v2 && git push origin --delete v2`).

---

## Achat d'un domaine perso (optionnel, ~10€/an)

Si tu en as marre de `vps-9bc559d8.vps.ovh.net`, achète un domaine genre `niveau-saints-peyres.fr` :

1. **Acheter** chez OVH, Cloudflare, Gandi (~10€/an)
2. **Configurer le DNS** : type `A` ou `AAAA` vers l'IP du VPS
3. **Modifier le Caddyfile** :
   ```bash
   ssh lac "sudo nano /etc/caddy/Caddyfile"
   # Ajouter :
   # niveau-saints-peyres.fr {
   #     encode gzip
   #     reverse_proxy localhost:3000
   # }
   ssh lac "sudo systemctl reload caddy"
   ```
4. Caddy demande un cert Let's Encrypt automatiquement au 1er accès.

---

## Pour aller plus loin

- Modèle de sécurité : [07-security.md](07-security.md)
- Pourquoi on a fait les choix qu'on a faits : [09-history.md](09-history.md)
