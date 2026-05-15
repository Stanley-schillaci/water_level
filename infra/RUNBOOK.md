# Runbook — Déploiement et exploitation V2

Guide de déploiement sur OVH VPS Starter + cutover depuis Streamlit Cloud.
Spec : `docs/superpowers/specs/2026-05-15-water-level-v2-design.md`

---

## 1. Commande du VPS OVH

1. Compte OVH → **Public Cloud** ou **VPS** → **VPS Starter** (~4,2€/mois TTC).
2. Image système : **Ubuntu 24.04 LTS**.
3. Datacenter : **Roubaix (RBX)** ou **Strasbourg (SBG)** selon dispo.
4. Configuration SSH : ajouter ta clé publique (`~/.ssh/id_ed25519.pub`) avant validation.
5. Une fois provisionné, OVH t'envoie un email avec :
   - L'IP publique
   - Le reverse DNS du type `vpsXXXXXXXX.vps.ovh.net` (HTTPS auto sur ce FQDN)
   - Les credentials SSH (utilisateur `ubuntu` ou `debian`)

---

## 2. Bootstrap (une seule fois, depuis ton Mac)

```bash
# Test SSH
ssh ubuntu@vpsXXXXXXXX.vps.ovh.net

# Sur le VPS, en root :
sudo -i
cd /tmp
git clone https://github.com/Stanley-schillaci/water_level.git -b v2
cd water_level
bash infra/bootstrap.sh
```

Le script crée l'utilisateur `app`, installe Caddy/Node22/Python/uv/sqlite3, configure Caddy pour le FQDN OVH avec TLS Let's Encrypt automatique, installe les unités systemd. Il **ne lance pas encore les services** (besoin du code + de la DB).

Vérifier :
```bash
systemctl status caddy
node -v   # v22.x
sudo -u app /home/app/.local/bin/uv --version
```

---

## 3. Upload de la DB initiale

Depuis ton Mac :
```bash
# Restaurer la DB depuis v1.0.0 (si pas déjà fait)
cd /Users/stanley.schillaci/Documents/stan/water_level
git show v1.0.0:niveau_eau.db > niveau_eau.db

# Migrer localement (au cas où)
cd worker && uv run lac-migrate && cd ..

# Push vers le VPS
make upload-db VPS=app@vpsXXXXXXXX.vps.ovh.net
```

---

## 4. Premier déploiement

```bash
# Préparer les .env distants
ssh app@vpsXXXXXXXX.vps.ovh.net
# Sur le VPS, en tant que `app` :
cat > /opt/lac/worker/.env <<EOF
LAC_DB_PATH=/var/lib/lac/niveau_eau.db
LAC_API_AUTH=Basic TGFldGlzTjF2ZWF1
OPENAI_API_KEY=sk-...   # ta vraie clé perso
EOF

cat > /opt/lac/web/.env.production <<EOF
LAC_DB_PATH=/var/lib/lac/niveau_eau.db
ADMIN_PASSWORD=un-mot-de-passe-pour-l-admin
SESSION_PASSWORD=au-moins-32-caracteres-aleatoires-genere-avec-openssl-rand-hex-16
EOF
exit
```

```bash
# Depuis ton Mac
cd /Users/stanley.schillaci/Documents/stan/water_level
make deploy VPS=app@vpsXXXXXXXX.vps.ovh.net
```

Cette commande :
- builde Next.js localement,
- rsync `web/` et `worker/` vers le VPS,
- installe les `node_modules` et `uv sync` côté VPS,
- restart `lac-web.service` et reload Caddy.

---

## 5. Activation des cron timers

```bash
ssh app@vpsXXXXXXXX.vps.ovh.net
sudo systemctl start lac-web.service lac-scraper.timer lac-ai.timer lac-backup.timer
sudo systemctl status lac-web.service
```

Vérifier les timers :
```bash
systemctl list-timers --all | grep lac
```

Tu dois voir :
- `lac-scraper.timer` — toutes les 20 min
- `lac-ai.timer` — chaque jour 07:00
- `lac-backup.timer` — chaque jour 02:00

---

## 6. Smoke tests post-déploiement

```bash
curl -i https://vpsXXXXXXXX.vps.ovh.net/api/health
# Attendu : HTTP 200, JSON {status: "ok", last_measure_age_min, db_size_mb}

curl https://vpsXXXXXXXX.vps.ovh.net/api/ai/commentary
# Attendu : la phrase IA du jour

curl https://vpsXXXXXXXX.vps.ovh.net/api/water/recent?days=3 | head -c 200
# Attendu : les mesures des 3 derniers jours
```

Ouvre `https://vpsXXXXXXXX.vps.ovh.net/` dans Safari iPhone :
- Page Now visible
- Bottom nav fonctionne (Now / Annuel / Histo)
- "Partager → Sur l'écran d'accueil" pour installer la PWA

---

## 7. UptimeRobot — alerting (5 min)

1. https://uptimerobot.com — créer un compte gratuit (50 monitors free).
2. Add monitor :
   - Type : **HTTPS**
   - URL : `https://vpsXXXXXXXX.vps.ovh.net/api/health`
   - Interval : **5 min**
   - Alert contact : email ou Telegram
3. Le healthcheck renvoie HTTP 503 si la dernière mesure date de > 120 min → tu seras notifié si le scraping plante.

---

## 8. Cutover Streamlit → V2 (J → J+12)

| Jour | Action |
|------|--------|
| J | Bootstrap VPS + upload DB + deploy + smoke tests OK |
| J → J+3 | Toi seul utilises l'URL VPS pour vérifier que tout tourne (cron, IA, backups) |
| J+3 | Annonce à papa : nouvelle URL `https://vpsXXXXXXXX.vps.ovh.net/`. Garder Streamlit Cloud ouvert pour comparer |
| J+3 → J+10 | Papa installe la PWA. Streamlit reste up en backup |
| J+10 | Si tout est stable, archive Streamlit Cloud (pause de l'app, garder le repo) |
| J+30 | Merge `v2` → `main`. Tag `v2.0.0`. Suppression définitive du Streamlit |

### Rollback (avant J+30)
- Repointer papa vers `https://gothis.streamlit.app/`. Streamlit lit toujours sa DB Streamlit Cloud — pas de perte de données.
- Le VPS peut être laissé en sommeil ou détruit.

---

## 9. Mises à jour de routine

```bash
# Local : commit + push v2
git push origin v2

# Deploy
make deploy VPS=app@vpsXXXXXXXX.vps.ovh.net
make status VPS=app@vpsXXXXXXXX.vps.ovh.net
```

---

## 10. Debug rapide

```bash
make logs VPS=...           # Next.js
make logs-scraper VPS=...   # Python scraper
make logs-ai VPS=...        # Python AI refresher

# Sur le VPS
sudo journalctl -u lac-web.service --since "1 hour ago"
sudo journalctl -u lac-scraper.service --since "today"

# Forcer une exécution
sudo systemctl start lac-scraper.service
sudo systemctl start lac-ai.service

# DB
sqlite3 /var/lib/lac/niveau_eau.db "SELECT COUNT(*) FROM water_level; SELECT MAX(datetime_event) FROM water_level;"
```

---

## 11. Coûts récapitulatifs

| Item | Provider | URL | Coût |
|---|---|---|---|
| VPS Starter | OVH | ovhcloud.com | ~4,2€/mois |
| LLM | OpenAI (compte perso) | platform.openai.com | ~0,10€/mois |
| Uptime | UptimeRobot | uptimerobot.com | 0€ |
| Domain | aucun | — | 0€ |
| **Total** | | | **~4,3€/mois** |
