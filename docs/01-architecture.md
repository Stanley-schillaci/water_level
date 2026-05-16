# 01 — Architecture

Vue d'ensemble technique de l'application. À lire en premier après le README.

---

## Vue d'ensemble

L'application est composée de **3 processus indépendants** qui tournent sur **un seul VPS** et partagent **un seul fichier SQLite**. Cette séparation est délibérée pour 3 raisons :

1. **Le scraping ne dépend pas de la consultation web** — papa peut ne pas consulter pendant 1 semaine, les données continuent d'être collectées.
2. **La phrase IA est pré-calculée** — pas de latence OpenAI dans le rendu de la page Now.
3. **Next.js n'a qu'à lire la DB** — pas de logique métier complexe côté front, juste de l'affichage.

---

## Diagramme détaillé

```
┌──────────────────────── OVH VPS-1 (Roubaix, Ubuntu 24.04 LTS) ────────────────────────┐
│                                                                                        │
│                       ┌──── Internet ────┐                                             │
│                       │  Laetis API       │                                            │
│                       │ data.niv-eau.fr   │                                            │
│                       └────────┬──────────┘                                            │
│                                │ 1 GET /hydro/lieu/198/{dd-mm-YYYY}                    │
│                                ▼                                                       │
│   ┌────────────────────────────────────┐                                               │
│   │ lac-scraper.service (Python)        │                                              │
│   │ • lit empty_days (jours marqués)    │  ┌──────────────────────────────┐            │
│   │ • appelle API pour jours manquants  │─▶│  /var/lib/lac/                │           │
│   │ • si vide >7j, marque empty_days    │  │      niveau_eau.db (WAL)      │           │
│   │ • timer systemd toutes les 20 min   │  │                                │          │
│   └────────────────────────────────────┘  │   • water_level                │           │
│                                            │   • threshold_line             │           │
│   ┌────────────────────────────────────┐  │   • gpt_logs                   │           │
│   │ lac-ai.service (Python)             │  │   • empty_days                 │           │
│   │ • calcule les KPIs                  │  └──────────┬───────────────────┘             │
│   │ • call OpenAI GPT-4o ×2             │             ▲                                │
│   │ • stocke réponses dans gpt_logs     │             │ lectures + écritures           │
│   │ • timer systemd quotidien 07:00     │─────────────┤   (better-sqlite3)             │
│   └────────────────────────────────────┘             │                                 │
│                                                       │                                │
│   ┌────────────────────────────────────┐             │                                 │
│   │ lac-web.service (Next.js 15)        │             │                                │
│   │ • SSR pages / /annuel /admin /options│◀────────────┘                                │
│   │ • API routes /api/water/* /api/ai/* │                                              │
│   │ • API mutations /api/thresholds     │                                              │
│   │ • iron-session (cookie HttpOnly)    │                                              │
│   │ • daemon always-on (port 3000)      │                                              │
│   └────────────────────────────────────┘                                              │
│                          ▲                                                              │
│                          │                                                              │
│   ┌──────────────────────┴──────────────────┐                                          │
│   │ Caddy (reverse proxy + TLS auto)         │                                         │
│   │ • Let's Encrypt automatique               │                                         │
│   │ • port 443 → localhost:3000               │                                         │
│   └───────────────┬──────────────────────────┘                                          │
│                   │                                                                     │
│   ┌───────────────┴──────┐                                                              │
│   │ lac-backup.service    │                                                            │
│   │ • snapshot DB chaque  │                                                            │
│   │   nuit 02:05, 7j      │                                                            │
│   │   conservés           │                                                            │
│   └──────────────────────┘                                                              │
└─────────────────────────────────────────────┬──────────────────────────────────────────┘
                                              │
                                              ▼ HTTPS port 443
                                       iPhone Pro Max
                                  (PWA via "Sur l'écran d'accueil")
```

---

## Flux de données principaux

### 1. Ingestion (toutes les 20 min)

```
Laetis API ─→ scraper.py ─→ niveau_eau.db (table water_level)
                  │
                  └─→ Si API renvoie [] et jour > 7j passé : ─→ empty_days
                       (évite de re-cogner l'API à l'infini sur des jours blancs)
```

### 2. Génération IA (cadence configurable, V2.3)

```
ai-refresher.py (tick toutes les heures à xx:55, Europe/Paris)
  ├─ Lit ai_policy → decide-t-on de générer ? (selon mois + heure courante)
  │   • Si oui : continue. Si non : skip silencieux.
  ├─ Lit display_settings (calibrations + tirant + marge + system_prompt)
  ├─ Lit calibration_history → ponton actif + fraîcheur
  ├─ Lit threshold_line (repères perso pour le prompt)
  ├─ Lit gpt_logs : 7 dernières phrases (continuité narrative)
  ├─ Construit user prompt avec toutes ces données
  ├─ Appelle GPT-5 (system + user, reasoning_effort=minimal)
  └─ Stocke {model, system_prompt, prompt, response, tokens} dans gpt_logs
```

### 3. Consultation (à chaque visite)

```
Browser iPhone
  │
  ▼ HTTPS
Caddy (reverse proxy, TLS)
  │
  ▼ HTTP
Next.js (App Router, SSR)
  ├─ Page / (Niveau actuel, émoji 💧)
  │   ├─ getRecentMeasures(7) → KPIs côté serveur
  │   ├─ getLatestAICommentary('tendance') → bannière
  │   ├─ LevelHero (niveau + date dernière mesure)
  │   └─ ColoredCurveChart côté client : fetch /api/water/recent?days=N
  │       (courbe segmentée colorée selon la pente locale, palette V1)
  ├─ Page /annuel (émoji 📈) — 2 sections empilées :
  │   ├─ Comparaison annuelle :
  │   │   ├─ computeAnnualKpis() côté serveur (VS Y-1, Y-2, Y-3) — pas de phrase IA depuis V2.3
  │   │   └─ AnnualChart côté client : fetch /api/water/yearly?years=...
  │   └─ Historique complet :
  │       └─ FullHistoryChart côté client : fetch /api/water/full
  │           (1 série/année avec palette 6 couleurs)
  ├─ Page /admin
  │   ├─ Bloc explicatif "À quoi servent les seuils ?"
  │   ├─ Si session valide : getThresholds() + AdminClient
  │   └─ Sinon : LoginForm → POST /api/auth/login
  └─ Page /options (émoji ⚙️)
      ├─ Sélecteur thème (système/clair/sombre, localStorage)
      ├─ Monitoring (dernière mesure, IA, taille DB)
      ├─ Bouton vers /admin
      └─ FAQ (7 accordions sur calculs / IA / seuils)
```

### 4. Mutations admin

```
Browser
  │  POST /api/auth/login {password}
  ▼
Next.js
  ├─ Compare avec env.ADMIN_PASSWORD
  ├─ Si OK : session.isAdmin = true → cookie HttpOnly chiffré (iron-session)
  └─ Si KO : 401

Browser (session valide)
  │  POST /api/thresholds {name, value, color, ...}
  ▼
Next.js
  ├─ requireAdmin() vérifie le cookie
  ├─ Valide via Zod (range 600-700m, hex color, etc.)
  └─ createThreshold() → INSERT dans threshold_line
```

---

## Choix techniques (et pourquoi)

| Couche | Choix | Justification |
|---|---|---|
| **OS** | Ubuntu 24.04 LTS | Support jusqu'à avril 2029, image standard OVH, écosystème mature |
| **Reverse proxy** | Caddy | TLS Let's Encrypt en 3 lignes de config, renew auto, pas de cron renouvellement |
| **Frontend** | Next.js 15 (App Router) + TypeScript | SSR pour rendu instantané sur 3G, route handlers natifs pour API, React Server Components |
| **Charts** | Apache ECharts (`echarts-for-react`) | Gestures touch natifs (pinch-zoom, pan), bien mieux que Plotly sur mobile, rendu Canvas (perf) |
| **CSS** | Tailwind 4 | Dark/light auto via `prefers-color-scheme`, minimaliste, utility-first |
| **DB driver Node** | `better-sqlite3` | Synchrone, ouverture directe du fichier, mature, performant |
| **Session** | `iron-session` | Stateless (cookie chiffré), pas de DB pour les sessions |
| **PWA** | Manifest + apple-touch-icon | Pas de service worker (pas besoin offline), iOS-installable |
| **Worker** | Python 3.12 + `uv` | Réutilise le code V1 rodé depuis 1 an, déps gérées avec lockfile |
| **Worker tests** | pytest | Standard, mature |
| **Web tests** | Vitest (logique) seulement | UI testée visuellement, KPI testée unitairement |
| **DB** | SQLite (gardée depuis V1) | Fichier unique, 1 utilisateur = pas besoin de PostgreSQL, mode WAL pour lectures concurrentes |
| **Service manager** | systemd | Natif Linux, timers, journalctl pour les logs |
| **Backups** | `sqlite3 .backup` quotidien | Local, 7 derniers conservés, suffisant pour cet enjeu |
| **Monitoring** | UptimeRobot free + healthcheck `/api/health` | 0€, alerte email si stale > 120 min |

---

## Ce qu'on ne fait PAS (et pourquoi)

| Anti-choix | Raison |
|---|---|
| Pas de **Docker** | 1 VPS, 1 app, 1 user → systemd suffit, Docker = overhead |
| Pas de **base PostgreSQL** | 1 utilisateur, 145k lignes, SQLite WAL est largement plus rapide |
| Pas de **CDN devant** | Trafic = 5-10 visites/jour, latence française < 30 ms |
| Pas de **service worker PWA offline** | Pas pertinent : si offline, pas de mesures fraîches non plus |
| Pas de **comptes utilisateurs** | 1 utilisateur principal (papa) + 1 admin (toi) suffit |
| Pas de **rate-limiting fin sur l'admin** | Faible enjeu, gothis1234 + 5 essais/h via fail2ban suffit |
| Pas de **CI/CD** | `make deploy` depuis le Mac suffit, pas de team |
| Pas de **monitoring APM** (Datadog, Sentry) | journalctl + UptimeRobot suffisent pour ce volume |
| Pas de **réplication DB** | Crash hardware → backups quotidiens, perte max 24h, acceptable |

---

## Vue d'arborescence du repo

```
water_level/
├── README.md                    ← le point d'entrée
├── LICENSE
├── Makefile                     ← deploy / logs / status
├── .gitignore
│
├── docs/                        ← cette documentation
│   ├── 01-architecture.md
│   ├── 02-database.md
│   ├── 03-worker-python.md
│   ├── 04-frontend.md
│   ├── 05-infrastructure.md
│   ├── 06-operations.md
│   ├── 07-security.md
│   ├── 08-glossary.md
│   └── 09-history.md
│
├── infra/                       ← bootstrap + systemd
│   ├── bootstrap.sh             ← provisioning VPS (idempotent)
│   └── systemd/
│       ├── lac-web.service      ← daemon Next.js
│       ├── lac-scraper.service  ← oneshot Python scraping
│       ├── lac-scraper.timer    ← toutes les 20 min
│       ├── lac-ai.service       ← oneshot Python IA
│       ├── lac-ai.timer         ← chaque jour 07:00
│       ├── lac-backup.service   ← oneshot SQLite backup
│       └── lac-backup.timer     ← chaque jour 02:05
│
├── web/                         ← Next.js 15 (TypeScript)
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── .env.local.example
│   ├── public/
│   │   ├── manifest.webmanifest ← PWA
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── apple-touch-icon.png
│   ├── src/
│   │   ├── app/                 ← Next.js App Router
│   │   │   ├── layout.tsx       ← root layout + AppShell + bootstrap thème
│   │   │   ├── page.tsx         ← / (Niveau actuel, émoji 💧)
│   │   │   ├── _ColoredCurveChart.tsx  ← graph par segment selon pente
│   │   │   ├── annuel/page.tsx  ← /annuel (Comparaison + Histo, émoji 📈)
│   │   │   ├── admin/page.tsx   ← /admin (protégé par mdp)
│   │   │   ├── options/page.tsx ← /options (émoji ⚙️)
│   │   │   └── api/             ← 9 routes API
│   │   ├── components/          ← composants UI partagés
│   │   │   ├── AppShell.tsx
│   │   │   ├── BottomNav.tsx    ← 3 émojis (💧 📈 ⚙️)
│   │   │   ├── AIBanner.tsx
│   │   │   ├── LevelHero.tsx    ← gros niveau actuel + date
│   │   │   ├── KpiGrid.tsx      ← grille 2×2 des deltas
│   │   │   ├── DaysSelector.tsx
│   │   │   ├── YearSelector.tsx
│   │   │   └── WaterChart.tsx
│   │   └── lib/
│   │       ├── db.ts            ← better-sqlite3 + queries
│   │       ├── kpi.ts           ← computeKpis, computeAnnualKpis
│   │       ├── session.ts       ← iron-session config
│   │       └── auth.ts          ← getSession, requireAdmin
│   └── tests/
│       └── kpi.test.ts          ← 4 tests Vitest
│
└── worker/                      ← Python 3.12 (uv)
    ├── pyproject.toml           ← deps + 3 console scripts
    ├── uv.lock
    ├── .env.example
    ├── Makefile                 ← test / lint / run-* localement
    ├── src/lac_worker/
    │   ├── config.py
    │   ├── db.py                ← SQLite layer (init + CRUD)
    │   ├── api.py               ← client Laetis
    │   ├── scraper.py           ← orchestration ingestion
    │   ├── kpi.py               ← calculs KPIs
    │   ├── ai.py                ← prompts + OpenAI
    │   ├── migrate.py           ← V1→V2 one-shot
    │   └── cli.py               ← entrypoints console
    └── tests/                   ← 47 tests pytest
```

---

## Pour aller plus loin

- Détail du modèle de données : [02-database.md](02-database.md)
- Détail du worker Python : [03-worker-python.md](03-worker-python.md)
- Détail du front Next.js : [04-frontend.md](04-frontend.md)
