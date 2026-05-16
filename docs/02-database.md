# 02 — Base de données

Stockage : **un seul fichier SQLite** (`/var/lib/lac/niveau_eau.db`) partagé entre le worker Python et Next.js, en mode **WAL** pour autoriser les lectures concurrentes pendant l'écriture.

---

## Pourquoi SQLite ?

- **1 utilisateur principal** + 1 admin : pas besoin de gestion de pool de connexions, pas de réseau, pas de tuning Postgres.
- **~145 000 lignes** en mai 2026 (sur 5 ans de mesures à raison de 70/jour). Performances : toutes les requêtes < 5 ms.
- **Fichier unique** = backup = `cp niveau_eau.db backup.db`. Simplicité opérationnelle maximale.
- **Mode WAL** = `next.js` peut lire pendant que `scraper.py` écrit. Plus de "database is locked".

> La V1 utilisait déjà SQLite. On a gardé le schéma pour migrer sans transformer la donnée.

---

## Schéma

```
┌─────────────────────────┐    ┌────────────────────────────┐
│ water_level             │    │ threshold_line             │
│─────────────────────────│    │────────────────────────────│
│ id (PK)                 │    │ id (PK)                    │
│ date_event (DATE)       │    │ name                       │
│ datetime_event (UNIQUE) │    │ description                │
│ value (REAL)            │    │ value (REAL)               │
│ unit (TEXT)             │    │ color (TEXT)               │
└─────────────────────────┘    │ dash_style (TEXT)          │
                                │ created_at                 │
   idx_water_level_date_event   │ updated_at                 │
                                │ deleted_at (soft delete)   │
                                │ is_deleted (0/1)           │
                                └────────────────────────────┘

┌────────────────────────────┐    ┌────────────────────────────┐
│ gpt_logs                   │    │ empty_days                 │
│────────────────────────────│    │────────────────────────────│
│ id (PK)                    │    │ date_event (PK)            │
│ model (TEXT)               │    │ first_attempted_at         │
│ prompt (TEXT)              │    │ last_attempted_at          │
│ response (TEXT)            │    │ attempts (INT)             │
│ prompt_tokens (INT)        │    └────────────────────────────┘
│ completion_tokens (INT)    │
│ total_tokens (INT)         │
│ created_at                 │    ┌────────────────────────────┐
│ type (TEXT)                │    │ ai_policy (singleton id=1) │
│   = 'tendance' OU          │    │────────────────────────────│
│     'comparaison_annuelle' │    │ enabled (0/1)              │
└────────────────────────────┘    │ high_season_months (CSV)   │
                                  │ high_season_hours (CSV)    │
NOTE: pas de FK entre les tables. │ low_season_hours (CSV)     │
SQLite est lâche sur les          │ last_run_at (UTC)          │
contraintes, et le métier ne le   │ last_run_status            │
justifie pas.                     │ last_error                 │
                                  │ updated_at                 │
                                  └────────────────────────────┘
```

---

## Détail de chaque table

### `water_level` — les mesures brutes

```sql
CREATE TABLE water_level (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date_event      DATE,            -- 'YYYY-MM-DD' du jour de la mesure
    datetime_event  DATETIME,        -- 'YYYY-MM-DD HH:MM:SS' précis
    value           REAL,            -- niveau en mètres NGF (mNGF)
    unit            TEXT,            -- 'mNGF' (toujours)
    UNIQUE(datetime_event)
);
CREATE INDEX idx_water_level_date_event ON water_level(date_event);
```

- **Une ligne par mesure** Laetis (env. 1 toutes les 20 min)
- **`datetime_event` UNIQUE** : empêche les doublons à l'insertion (`add_measure` retourne `False` si déjà présent)
- **`idx_water_level_date_event`** : critique pour les agrégats par jour (graphs annuels)

**Volume** : ~70 lignes/jour × 365 j × 5 ans = ~127 000 lignes en cible.

### `threshold_line` — les lignes de seuil affichées sur les graphs

```sql
CREATE TABLE threshold_line (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,                       -- "Coque touche le fond"
    description  TEXT NOT NULL DEFAULT '',            -- texte long, non affiché sur graph
    value        REAL NOT NULL,                       -- la valeur en mNGF
    color        TEXT NOT NULL DEFAULT '#1f77b4',     -- hex
    dash_style   TEXT NOT NULL DEFAULT 'dash',        -- 'solid'|'dash'|'dot'|'dashdot'|'longdash'
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at   DATETIME,
    is_deleted   INTEGER NOT NULL DEFAULT 0
);
```

- **Soft delete** (`is_deleted = 1` + `deleted_at`) — on garde l'historique sans encombrer
- Les requêtes lecture filtrent `WHERE is_deleted = 0`
- Editable depuis la page `/admin`

### `gpt_logs` — historique complet des appels OpenAI

```sql
CREATE TABLE gpt_logs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    model               TEXT,           -- 'gpt-4o'
    prompt              TEXT,           -- le prompt complet envoyé
    response            TEXT,           -- la phrase générée
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    total_tokens        INTEGER,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type                TEXT NOT NULL DEFAULT 'tendance'
);
```

- **Sert aussi de source de vérité pour le front** : `GET /api/ai/commentary?kind=tendance` renvoie la dernière ligne `type='tendance'`
- **Audit** : on peut compter les tokens consommés sur 30 jours pour estimer les coûts OpenAI
- 1× / jour = 365 lignes/an, pas de souci de volume

### `empty_days` — auto-détection des jours sans donnée API (V2 nouveauté)

```sql
CREATE TABLE empty_days (
    date_event          DATE PRIMARY KEY,
    first_attempted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempted_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts            INTEGER NOT NULL DEFAULT 1
);
```

**Pourquoi ?** L'API Laetis renvoie parfois `{"chroniques": []}` pour certains jours (maintenance, panne capteur, etc.). Sans tracking, le scraper ré-interrogerait ces jours indéfiniment.

**Logique côté scraper** (voir [03-worker-python.md](03-worker-python.md)) :
1. Si l'API renvoie des mesures → insère + supprime de `empty_days` si présent
2. Si l'API renvoie `[]` et le jour est **vieux de ≥ 7 jours** → marque dans `empty_days`
3. Si l'API renvoie `[]` mais le jour est récent (< 7j) → on retente plus tard (l'API peut publier en retard)

Le SQL `get_missing_days` exclut **water_level** ET **empty_days** :
```sql
SELECT date FROM all_dates
WHERE date NOT IN (SELECT date_event FROM water_level)
  AND date NOT IN (SELECT date_event FROM empty_days);
```

> **Avant V2** : c'était un fichier `ignore_dates.yaml` mis à jour à la main. Insupportable à long terme. La table `empty_days` rend ça automatique et observable (`SELECT * FROM empty_days` = liste exhaustive des jours blancs).

### `ai_policy` — cadence de génération des phrases IA (V2.1)

Singleton (toujours exactement 1 ligne, `id = 1`) qui pilote :

- l'activation globale du worker IA ;
- les mois et heures de "haute saison" (cadence accrue, défaut mai-août, 4×/jour) ;
- les heures de "basse saison" (défaut 1×/jour) ;
- le résultat du dernier run (utilisé par le badge ⚠️ dans le bottom nav).

```sql
CREATE TABLE ai_policy (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    enabled             INTEGER NOT NULL DEFAULT 1,
    high_season_months  TEXT NOT NULL DEFAULT '5,6,7,8',
    high_season_hours   TEXT NOT NULL DEFAULT '6,10,14,18',
    low_season_hours    TEXT NOT NULL DEFAULT '7',
    last_run_at         DATETIME,                           -- UTC (CURRENT_TIMESTAMP)
    last_run_status     TEXT,                               -- 'ok' | 'failed' | NULL
    last_error          TEXT,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Fuseau horaire** :
- Les heures cochées (`high_season_hours`, `low_season_hours`) sont des **heures de Paris**.
- `last_run_at` est en **UTC** (cohérence avec les autres tables qui utilisent `CURRENT_TIMESTAMP`).
- La conversion UTC↔Paris est faite dans `worker/policy.py` via `zoneinfo.ZoneInfo("Europe/Paris")`.

**Auto-bootstrap** : la table + la ligne sont créées idempotemment par `worker/db.py::init_db()` ET par `web/lib/db.ts::ensureAiPolicy()`. Le frontend ne dépend donc pas du worker pour démarrer.

**Edit via** : `/admin` (section « 🤖 Phrases IA ») → routes `GET/POST /api/admin/ai/policy`. Le worker tourne en cron horaire (`xx:55`) et appelle `should_generate_now()` à chaque tick (cf [03-worker-python.md](03-worker-python.md)).

---

## Mode WAL (Write-Ahead Logging)

Activé via `PRAGMA journal_mode = WAL;` au démarrage de `init_db()`.

**Effet** :
- Les écritures vont dans un fichier annexe `niveau_eau.db-wal`
- Les lectures peuvent se faire en parallèle d'une écriture sans verrouillage
- Périodiquement (auto-checkpoint), SQLite réintègre le WAL dans le fichier principal

**Fichiers visibles** :
```
/var/lib/lac/
├── niveau_eau.db           (le fichier principal)
├── niveau_eau.db-wal       (journal write-ahead)
└── niveau_eau.db-shm       (mémoire partagée pour la coordination)
```

**Permissions critiques** : ces 3 fichiers doivent être writable par l'utilisateur `app` (qui fait tourner `lac-web` et les workers). Le bootstrap.sh applique `chmod 2775` sur `/var/lib/lac/` (sgid bit) pour que tout nouveau fichier hérite du groupe `app`.

---

## Backups

### Stratégie

- **Quotidien** : `sqlite3 .backup` → `/var/lib/lac/backups/niveau_eau-YYYYMMDD.db`
- **Rotation** : 7 derniers conservés (les plus anciens supprimés)
- **Lanceur** : timer systemd `lac-backup.timer` (chaque nuit 02:05)

### Pourquoi `.backup` plutôt que `cp` ?

`sqlite3 .backup` est l'API officielle SQLite pour faire un snapshot cohérent même quand la DB est en écriture. Un `cp` brut pourrait copier la DB pendant qu'une transaction est en cours et produire un fichier corrompu.

### Restauration

```bash
ssh lac
sudo systemctl stop lac-web.service lac-scraper.timer
sudo cp /var/lib/lac/backups/niveau_eau-20260512.db /var/lib/lac/niveau_eau.db
sudo chown app:app /var/lib/lac/niveau_eau.db
sudo systemctl start lac-web.service lac-scraper.timer
```

### Backup externe (optionnel)

Pour aller plus loin, on peut rajouter une copie quotidienne vers un cloud externe :

- **rsync vers iCloud Drive** : 0€, fiable, depuis le Mac qui se réveille
- **Backblaze B2** : ~0,5€/mois, déclenché depuis le VPS

Pas implémenté en V2 par simplicité ; à ajouter si besoin de DR multi-géo.

---

## Migration V1 → V2

Script `lac-migrate` (worker Python). Idempotent, à lancer 1× à la mise en service du VPS.

```bash
ssh lac "cd /opt/lac/worker && /usr/local/bin/uv run lac-migrate"
```

**Ce qu'il fait** :
1. Appelle `init_db()` : crée la table `empty_days` si manquante, applique l'index `idx_water_level_date_event`, active WAL
2. Insère dans `empty_days` les **11 dates** héritées de l'ancien `ignore_dates.yaml` :
   - 04-09-2021, 07-09-2021
   - 19-10-2022 → 22-10-2022 (4 jours)
   - 19-08-2023
   - 21-06-2024, 22-06-2024
   - 17-02-2025, 18-02-2025

La liste est hardcodée dans `worker/src/lac_worker/migrate.py` (constante `V1_IGNORE_DATES_DDMMYYYY`).

---

## Requêtes utiles (debug)

```bash
ssh lac
sudo -u app sqlite3 /var/lib/lac/niveau_eau.db
```

```sql
-- Combien de mesures, dernière mesure
SELECT COUNT(*) AS total, MAX(datetime_event) AS dernière FROM water_level;

-- Mesures par mois
SELECT substr(date_event, 1, 7) AS mois, COUNT(*) FROM water_level GROUP BY mois ORDER BY mois;

-- Jours blancs détectés automatiquement
SELECT * FROM empty_days ORDER BY date_event;

-- Coût LLM sur 30 jours
SELECT SUM(total_tokens), COUNT(*) FROM gpt_logs WHERE created_at >= datetime('now', '-30 days');

-- Dernière phrase IA générée
SELECT type, response, created_at FROM gpt_logs ORDER BY created_at DESC LIMIT 5;

-- Seuils actifs
SELECT id, name, value, color FROM threshold_line WHERE is_deleted = 0;

-- Trous dans les données récentes (jours sans aucune mesure depuis 30 jours)
WITH RECURSIVE all_dates(d) AS (
    SELECT date('now', '-30 days')
    UNION ALL
    SELECT date(d, '+1 day') FROM all_dates WHERE d < date('now')
)
SELECT d FROM all_dates
WHERE d NOT IN (SELECT date_event FROM water_level)
  AND d NOT IN (SELECT date_event FROM empty_days);
```

---

## Pour aller plus loin

- Implémentation des helpers Python : [03-worker-python.md](03-worker-python.md)
- Accès Node depuis Next.js : [04-frontend.md](04-frontend.md) section "DB layer"
