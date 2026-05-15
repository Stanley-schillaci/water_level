# Design — Lac des Saints Peyres V2

- **Date** : 2026-05-15
- **Auteur** : Stanley Schillaci
- **Statut** : Design validé, prêt pour plan d'implémentation
- **Repo** : `Stanley-schillaci/water_level`, branche `v2`
- **Rollback** : tag `v1.0.0` sur `main` (état Streamlit Cloud fonctionnel)

## 1. Contexte et objectif

L'app V1 actuelle (`https://gothis.streamlit.app/`) monitore le niveau d'eau du barrage du lac des Saints Peyres pour usage personnel (mon père). Données récupérées depuis l'API publique `data.niv-eau.fr` (Laetis) toutes les 20 minutes.

**Limites de la V1** :
- Hébergement Streamlit Community Cloud : pas always-on, cold start 1-5 minutes à chaque consultation.
- UX mobile médiocre : Plotly sur iPhone (zoom involontaire au tap, gestures non intuitifs).
- Scraping déclenché au démarrage de l'app → si personne ne consulte, aucune donnée n'est ingérée.
- Gestion manuelle des jours sans données (`ignore_dates.yaml` édité à la main).
- Feature "Prévision Prophet jusqu'à fin d'année" jugée inutile.

**Objectif V2** :
- App always-on, ouverture instantanée depuis l'écran d'accueil iPhone (PWA installable).
- UX mobile native (gestures touch maîtrisés sur les graphiques).
- Scraping autonome, indépendant des consultations utilisateur.
- Détection automatique des jours sans données (plus de fichier YAML à maintenir).
- Hébergement sur infra contrôlée, budget ~5€/mois max.

**Public** : 1 utilisateur principal (mon père) qui consulte 5 à 10 fois par jour sur son iPhone Pro Max. Accès public sans authentification (données non sensibles).

## 2. Architecture générale

Un seul VPS, trois processus isolés partageant un fichier SQLite via WAL :

```
┌─────────────────────── OVH VPS Starter (Roubaix FR, Ubuntu LTS) ────────────────────────┐
│                                                                                          │
│  ┌──────────────────┐    ┌──────────────────────────────────┐                            │
│  │ scraper.py       │───▶│  niveau_eau.db (SQLite, WAL)     │                            │
│  │ systemd timer    │    │   • water_level (existant)       │                            │
│  │ toutes 20 min    │    │   • threshold_line (existant)    │                            │
│  └──────────────────┘    │   • gpt_logs (existant)          │                            │
│           │              │   • empty_days (nouveau)         │                            │
│           │              └──────────────────────────────────┘                            │
│           │                          ▲                                                   │
│           ▼                          │ lecture seule                                     │
│  ┌──────────────────┐    ┌──────────┴──────────────┐                                     │
│  │ ai_refresher.py  │    │  Next.js 15 (systemd)    │                                    │
│  │ systemd timer    │    │  • SSR Now/Annuel/Histo  │                                    │
│  │ 1×/jour à 07:00  │    │  • /admin (mdp)          │                                    │
│  └──────────────────┘    │  • API mutations seuils  │                                    │
│                          └────────────┬─────────────┘                                    │
│                                       │                                                  │
│  ┌───────────────────────────────┐    │                                                  │
│  │ Caddy (reverse proxy + HTTPS) │◀───┘                                                  │
│  │ TLS auto Let's Encrypt        │                                                       │
│  └───────────────┬───────────────┘                                                       │
└──────────────────┼───────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
            iPhone Pro Max
       (PWA installée écran d'accueil)
```

**Pourquoi cette séparation** :
- Le scraping est indépendant de l'app web → plus aucune donnée ratée même si personne ne consulte.
- Next.js sert uniquement de la donnée pré-mâchée → rendu en <100 ms sur 3G.
- La phrase IA est pré-calculée 1×/jour → zéro latence OpenAI dans le rendu.

## 3. Stack technique

### Frontend (`/web`, Node 22)

| Composant | Choix | Justification |
|---|---|---|
| Framework | **Next.js 15** (App Router, React 19) | SSR pour rendu instantané sur 3G, route handlers pour API |
| Charts | **Apache ECharts** via `echarts-for-react` | Gestures touch natifs (pinch-zoom, pan), dataZoom intégré, rendu Canvas performant |
| Styling | **Tailwind CSS** | Minimaliste, mode dark/light auto via `prefers-color-scheme` |
| DB driver | **better-sqlite3** | Synchrone, accès direct au fichier SQLite, mature |
| PWA | **`@serwist/next`** (successeur maintenu de `next-pwa`) | Manifest + service worker minimal → installable iOS |
| Tests | **Vitest** (logique) + **Playwright** (E2E 2-3 parcours) | Coverage suffisante sans surinvestir |

### Backend Python (`/worker`, Python 3.12, gestion deps via `uv`)

| Composant | Choix | Justification |
|---|---|---|
| `scraper.py` | Port quasi 1:1 de `update_missing_day.py` | Rodé depuis 1 an, garder la logique |
| `ai_refresher.py` | Port de `webapp/llm.py` | GPT-4o pour qualité, fréquence réduite à 1×/jour |
| `bdd.py` | Gardé tel quel + ajout helpers `empty_days` | Init DB, accès en écriture |
| Tests | **pytest** | DB temporaire pour les tests d'insertion |

### Infrastructure (`/infra`)

| Composant | Choix | Justification |
|---|---|---|
| Reverse proxy | **Caddy** | TLS Let's Encrypt automatique, config minimale (3 lignes) |
| Service manager | **systemd** | 1 service Next.js + 2 timers (scraper 20mn, IA 7h) |
| Provisioning | **bash** + **Makefile** | Pas de Docker, pas d'Ansible — simple comme un projet perso |
| Backup DB | **rsync** vers iCloud quotidien | 0€, OK pour cet enjeu (perte max 24h en cas de crash disque) |

### Hébergement

| Item | Provider | URL | Coût |
|---|---|---|---|
| VPS Starter (1 vCPU, 2 GB RAM, 20 GB SSD, 200 Mbps illimité) | OVH | ovhcloud.com | **~4,2€/mois TTC** |
| Domaine | — | — | 0€ (sous-domaine fourni par OVH) |
| LLM OpenAI GPT-4o (2 calls/jour, ~600 in + 120 out) | OpenAI | platform.openai.com | **~0,10€/mois** (pre-pay 5$ qui dure ~4 ans) |
| Backup B2 (optionnel, alternative au rsync iCloud) | Backblaze | backblaze.com | 0,5€/mois |
| Uptime monitoring | UptimeRobot | uptimerobot.com | 0€ |
| | | **TOTAL** | **~4,3-4,8€/mois** |

## 4. Modèle de données

On garde le schéma SQLite existant à 95%. Le fichier `niveau_eau.db` actuel (14 MB, ~1 an de mesures depuis 2021-07-07) est récupéré depuis le tag `v1.0.0` et migré sur le VPS.

### Schéma final

| Table | Origine | Modif V2 |
|---|---|---|
| `water_level` | Existant | Index `idx_water_level_date_event` ajouté |
| `threshold_line` | Existant | Aucune |
| `gpt_logs` | Existant | Aucune — sert de source de vérité pour la phrase IA |
| `empty_days` | **Nouveau** | Remplace `ignore_dates.yaml` (auto-détection) |

### Activations & index

```sql
-- Mode WAL : lectures concurrentes (Next.js lit, scraper écrit)
PRAGMA journal_mode = WAL;

-- Index manquant pour les agrégations par jour (graphs annuels)
CREATE INDEX IF NOT EXISTS idx_water_level_date_event
  ON water_level(date_event);
```

### Nouvelle table `empty_days`

```sql
CREATE TABLE IF NOT EXISTS empty_days (
  date_event DATE PRIMARY KEY,
  first_attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 1
);
```

**Logique du scraper (`scraper.py`)** :

```python
def scrape_day(date_str):
    measures = api_call(date_str).get("chroniques", [])
    age_days = (date.today() - parse(date_str)).days

    if measures:
        for m in measures:
            add_measure(m)
        delete_empty_day(date_str)  # au cas où l'API publie en retard

    elif age_days >= 7:
        # >= 7 jours dans le passé : on accepte que ce jour est définitivement vide
        upsert_empty_day(date_str, increment_attempts=True)
    # sinon (< 7 jours) : on ne marque rien, on retentera demain
```

**Et `get_missing_days` exclut désormais les deux** :

```sql
SELECT date FROM all_dates
WHERE date NOT IN (SELECT date_event FROM water_level)
  AND date NOT IN (SELECT date_event FROM empty_days);
```

### Migration one-shot depuis V1

Un script `migrate_v1_to_v2.py` (exécuté 1× au déploiement initial) :
1. Lit `ignore_dates.yaml` (récupéré via `git show v1.0.0:ignore_dates.yaml`).
2. Insère ces 11 dates dans `empty_days` avec `attempts=1`, `last_attempted_at=now()`.
3. Active WAL et crée l'index `idx_water_level_date_event`.

Le fichier `ignore_dates.yaml` n'existe plus dans la V2 — la table `empty_days` devient la source de vérité, alimentée automatiquement par le scraper.

### Pas de table `users`

L'admin est protégé par une env var `ADMIN_PASSWORD` sur le serveur + une session signée (cookie httpOnly chiffré via `iron-session`). Pas de DB pour la session = state-less, rotation par changement de l'env var.

### Phrase IA : pas de nouvelle table

La table `gpt_logs` existante stocke chaque génération avec son `type` (`'tendance'` ou `'comparaison_annuelle'`). Le front lit la dernière entrée du jour ; si rien aujourd'hui (worker pas encore passé), fallback sur la plus récente quelle que soit la date.

```sql
SELECT response FROM gpt_logs
WHERE type = 'tendance'
ORDER BY created_at DESC
LIMIT 1;
```

## 5. Composants frontend

### Layout commun (`<AppShell>`)

- Header : `💧 Saints Peyres` + indicateur "Mis à jour il y a N min" (calcul côté serveur).
- Contenu central scrollable.
- **Bottom nav fixe** (safe-area iPhone respectée) : `💧 Now` / `📈 Annuel` / `📊 Histo`.
- Pas de menu pour `/admin` : URL connue, accessible direct depuis un favori iPhone.
- Mode dark/light : automatique via `prefers-color-scheme`.
- Palette d'accent : bleu `#2563eb`.

### Vue 1 — `/` (Now)

Consultation quotidienne, écran principal.

| Composant | Comportement |
|---|---|
| `<AIBanner>` | Phrase IA tendance, fond bleu pâle. Toujours visible. |
| `<KpiGrid>` | 3 colonnes × 2 lignes : Dernier relevé, Niveau actuel, Tendance 7j m/j, VS hier, VS 3j, VS sem. dernière. Couleur verte/rouge sur les deltas. |
| `<DaysSelector>` | Chips tactiles `3j · 7j · 30j · 90j · 365j` (~44px hauteur, guidelines Apple touch). État persistant en `localStorage`. |
| `<WaterChart variant="recent">` | ECharts ligne + gradient sous la courbe. Lignes de seuil overlay. Touch gestures natifs : pinch-zoom, pan horizontal. Bouton ⛶ haut-droite → modale plein-écran landscape. |

### Vue 2 — `/annuel` (Comparaison annuelle)

"On est plus haut ou plus bas que les années précédentes ?"

| Composant | Comportement |
|---|---|
| `<AIBanner kind="annual">` | Phrase IA comparaison annuelle (1× par jour). |
| `<KpiGrid variant="annual">` | VS 2025, VS 2024, VS 2023 (delta en mètres, vert/rouge). |
| `<YearSelector>` | Multi-select chips des années dispos. Défaut = 4 dernières. |
| `<WaterChart variant="annual">` | Superposition années sur axe X = jour de l'année (1er jan → 31 déc). Tooltip groupé `x unified`. Légende cliquable pour masquer/afficher une année. |

### Vue 3 — `/histo` (Évolution depuis 2021)

Vue plus rare, "tout depuis le début".

| Composant | Comportement |
|---|---|
| `<WaterChart variant="full">` | Courbe continue depuis 2021-07-07. Color-by-year (palette stable). DataZoom slider en bas pour explorer une période précise. |

### Route `/admin` (protégée)

| Composant | Comportement |
|---|---|
| `<LoginForm>` | Si pas authentifié : champ password + bouton. `POST /api/auth/login` → cookie `iron-session` HttpOnly. |
| `<ThresholdsList>` | CRUD identique à la version Streamlit : nom, description, valeur (m), couleur, style de ligne. Add/Edit/Delete. |
| Bouton "Déconnexion" en haut. |

### Routes API (Next.js Route Handlers)

```
GET    /api/water/recent?days=N      → mesures détaillées (datetime + value)
GET    /api/water/yearly?years=...   → 1 mesure/jour (la 1ère) par année
GET    /api/water/full               → 1 mesure/jour depuis 2021-07-07
GET    /api/ai/commentary?kind=...   → dernière phrase IA (tendance|annual)
GET    /api/thresholds               → liste des seuils actifs (public)
POST   /api/thresholds               → créer (admin only)
PUT    /api/thresholds/:id           → modifier (admin only)
DELETE /api/thresholds/:id           → supprimer (admin only)
POST   /api/auth/login               → cookie de session signée
POST   /api/auth/logout              → vide le cookie
GET    /api/health                   → JSON {status, last_measure_age_min, db_size_mb}
```

### Touch UX sur les charts

ECharts active automatiquement `dataZoom` en mode tactile : pas de double-tap zoomant la page (problème Plotly). On désactive le zoom pinch du navigateur sur la zone du graphique (`touch-action: none` en CSS) pour éviter les conflits. Le bouton ⛶ plein-écran landscape règle les cas où papa veut explorer en détail.

## 6. Sécurité & accès

- **Lecture publique** : toutes les routes `GET /api/water/*`, `GET /api/ai/*`, `GET /api/thresholds`, et les pages `/`, `/annuel`, `/histo` sont accessibles sans authentification.
- **Mutations protégées** : `POST/PUT/DELETE /api/thresholds/*` et la page `/admin` exigent une session valide.
- **Authentification** :
  - Variable d'environnement `ADMIN_PASSWORD` sur le VPS (jamais en clair dans le repo).
  - Variable `SESSION_PASSWORD` (32+ caractères aléatoires) pour signer/chiffrer les cookies via `iron-session`.
  - Cookie HttpOnly, Secure, SameSite=Strict, expire après 7 jours d'inactivité.
- **Rate limiting léger** sur `/api/auth/login` : max 5 tentatives par IP par 15 minutes (middleware Next.js simple).
- **CSRF** : SameSite=Strict + vérification de l'origine sur les routes POST/PUT/DELETE.
- **Pas d'indexation** : `robots.txt` Disallow `/admin`, meta `noindex` sur les pages publiques (optionnel).

## 7. Déploiement & observabilité

### Provisioning initial du VPS (one-shot)

Script bash idempotent `infra/bootstrap.sh` exécuté 1× après création du VPS OVH :

```
apt update && apt upgrade -y
useradd -m -s /bin/bash app
install : caddy nodejs python3.12 sqlite3 git rsync
install uv (Python deps manager)
mkdir /var/lib/lac (DB) /opt/lac/web (Next.js) /opt/lac/worker (Python)
copy Caddyfile, copy 3 fichiers systemd (web.service + scraper.timer + ai.timer)
systemctl enable --now lac-web.service lac-scraper.timer lac-ai.timer
```

### Caddyfile

OVH attribue automatiquement un reverse DNS du type `vpsXXXXXXXX.vps.ovh.net` au VPS. On utilise ce FQDN comme nom canonique pour TLS :

```
vpsXXXXXXXX.vps.ovh.net {
    encode gzip
    reverse_proxy localhost:3000
}
```

TLS Let's Encrypt automatique, renouvellement géré par Caddy. Rien à configurer. Si tu décides plus tard d'acheter un vrai domaine (~10€/an), tu ajoutes une ligne `votredomaine.fr {...}` et Caddy gère le multi-hosts seul.

### Déploiement = `make deploy` (depuis le Mac)

```
rsync /web → vps:/opt/lac/web/ ; npm ci --omit=dev ; npm run build
rsync /worker → vps:/opt/lac/worker/ ; uv sync --frozen
ssh vps "systemctl restart lac-web && systemctl reload caddy"
```

Pas de CI/CD au démarrage. Si besoin plus tard, GitHub Actions = ~30 lignes de YAML.

### Observabilité minimaliste

| Quoi | Comment |
|---|---|
| **Logs applicatifs** | `journalctl -u lac-web -f` (Next.js) / `journalctl -u lac-scraper -f` (Python). Rotation native systemd. |
| **Healthcheck** | `GET /api/health` → `{status, last_measure_age_min, db_size_mb}`. Renvoie 503 si `last_measure_age_min > 120`. |
| **Uptime alerting** | UptimeRobot free, 1 monitor sur `/api/health` toutes les 5 min, alerte email/Telegram. 0€. |
| **Coût LLM tracking** | Table `gpt_logs` (déjà existante) : compter les tokens sur 30 jours, alerte si > seuil. |
| **Backup DB** | rsync quotidien `niveau_eau.db` → iCloud Drive (script cron 2h du matin). 7 derniers backups conservés. |

## 8. Plan de rollout (5 étapes)

1. **Préparation locale** (J → J+7)
   - Scaffold Next.js + Tailwind + ECharts dans `/web`.
   - Port du worker Python dans `/worker` (réutilisation de `bdd.py`, `update_missing_day.py`, `llm.py` adaptés).
   - Tests verts (Vitest + Playwright + pytest).
   - *Aucun impact prod.*

2. **VPS staging** (J+7 → J+10)
   - Provision OVH VPS Starter, exécution `bootstrap.sh`.
   - `git show v1.0.0:niveau_eau.db > niveau_eau.db` puis scp vers le VPS.
   - Premier déploiement, exécution `migrate_v1_to_v2.py`.
   - URL temporaire de test, validation pendant 2-3 jours en parallèle de Streamlit.
   - *Streamlit toujours en ligne pour papa.*

3. **Switch DB** (J+10)
   - La copie de DB sur le VPS devient la prod.
   - Le cron scraper du VPS prend le relais.
   - *L'ancienne app Streamlit reste up, lit toujours sa DB d'origine — fallback intact.*

4. **DNS / lien iPhone** (J+10 → J+12)
   - Communication de la nouvelle URL à papa.
   - Installation PWA sur écran d'accueil iPhone.
   - Archive de Streamlit Cloud (pas suppression).

5. **Cleanup** (J+30)
   - Si papa est à l'aise depuis 20 jours, suppression définitive du déploiement Streamlit Cloud.
   - Merge `v2` → `main`, tag `v2.0.0`.

### Stratégie de rollback

- **Avant J+30** : re-pointer papa vers `https://gothis.streamlit.app/`. La DB Streamlit n'a pas été touchée, elle continue d'ingérer en parallèle.
- **Après J+30** : rollback = redéployer V1 depuis `git checkout v1.0.0`. ~30 minutes.

### Risques identifiés

- **API Laetis (`data.niv-eau.fr`) reste un point unique de défaillance**. Pas de mitigation possible : c'est leur API publique. On loggera proprement les échecs et `empty_days` capturera naturellement les jours blancs.
- **VPS down = site down** (pas de réplication, OK pour ce niveau d'enjeu). Backup quotidien `.db` = perte max 24h en cas de crash disque.
- **Quota OpenAI** : 2 appels/jour à GPT-4o coûte ~0,10€/mois. Risque négligeable, alerte si dépassement anormal via `gpt_logs`.

## 9. Hors-scope (explicitement non fait)

- **Prévision Prophet jusqu'à fin d'année** : supprimée de la V1, non rééditée. Jugée inutile par le PO.
- **Comptes utilisateurs / multi-tenant** : non, accès public + 1 admin par mdp suffit.
- **Notifications push** : non au lancement. iOS supporte les notifications PWA depuis iOS 16.4 mais l'utilité ici est faible (papa consulte volontairement).
- **Export CSV public** : non. Si besoin, l'admin peut récupérer la DB via SSH.
- **App native iOS** : non, PWA suffit.
- **Backup vers cloud public** (B2, S3) : optionnel, on commence avec rsync iCloud à 0€.

## 10. Glossaire & conventions

- **mNGF** : mètres NGF (Nivellement Général de la France) — unité officielle d'altitude. La valeur brute renvoyée par l'API Laetis.
- **PWA** : Progressive Web App. Site web installable sur l'écran d'accueil iPhone, ouvrable en mode "fullscreen" sans barre Safari.
- **WAL** : Write-Ahead Logging, mode SQLite permettant lectures concurrentes pendant l'écriture.
- **Convention de commit** : style libre comme V1 (`feat:`, `fix:`, `chore:` recommandés mais non obligatoires).
- **Conventions Git** : `v2` est la branche de dev, `main` est la prod (V1 jusqu'au merge). Tag `v2.0.0` lors du merge final.
