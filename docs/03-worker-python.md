# 03 — Worker Python

Le **worker** est un package Python (`lac_worker`) qui expose **3 console scripts** lancés par systemd. Il s'occupe de tout ce qui touche à l'ingestion des données et à la génération de la phrase IA.

---

## Vue d'ensemble

```
worker/
├── pyproject.toml         ← deps + scripts CLI + ruff + pytest
├── uv.lock                ← lockfile reproductible
├── .env.example           ← template variables d'env
├── Makefile               ← test / lint / run-* localement
└── src/lac_worker/
    ├── config.py          ← Settings (env vars)
    ├── db.py              ← SQLite layer
    ├── api.py             ← Client HTTP Laetis
    ├── scraper.py         ← Orchestration ingestion
    ├── kpi.py             ← Calculs métier (deltas, comparaison annuelle)
    ├── ai.py              ← Prompts + appel OpenAI
    ├── policy.py          ← Décide si on doit générer (saison/heure/anti-doublon)
    ├── migrate.py         ← Migration V1 → V2 (one-shot)
    └── cli.py             ← Entrypoints des 3 console scripts
```

**3 console scripts** (déclarés dans `pyproject.toml`) :

| Commande | Module | Quand lancée |
|---|---|---|
| `lac-scraper` | `cli:scraper_main` | systemd timer toutes les 20 min |
| `lac-ai-refresh` | `cli:ai_refresher_main` | systemd timer toutes les heures (xx:55) — la policy décide |
| `lac-migrate` | `cli:migrate_main` | manuel, une seule fois au déploiement |

---

## Gestion des dépendances avec `uv`

`uv` (par Astral) est le gestionnaire moderne de Python. Il combine `pip`, `venv`, `pip-tools` en un seul binaire ultra-rapide.

**Pourquoi uv plutôt que pip + venv classique ?**
- 10× plus rapide
- Lockfile (`uv.lock`) reproductible cross-machine
- Pas de "il marche sur ma machine"

**Commandes utiles** :
```bash
cd worker
uv sync               # installe toutes les deps (prod + dev) dans .venv
uv sync --frozen      # idem mais sans re-résoudre (utiliser le lockfile tel quel)
uv add requests       # ajoute une dep et met à jour le lockfile
uv run pytest         # lance pytest dans le venv (sans activer)
uv run lac-scraper    # lance le CLI scraper
```

En prod, le bootstrap.sh installe uv globalement (symlink `/usr/local/bin/uv`) pour que systemd y ait accès.

---

## Module `config.py`

Charge les variables d'environnement requises. Échoue tôt si une variable manque (au lieu de planter plus loin).

```python
@dataclass(frozen=True)
class Settings:
    db_path: Path              # LAC_DB_PATH
    api_auth: str              # LAC_API_AUTH (header HTTP Laetis)
    openai_api_key: str        # OPENAI_API_KEY

    api_base_url: str = "https://data.niv-eau.fr/hydro/lieu/198"
    start_date: str = "2021-07-07"   # début des données Laetis
```

Pas de `load_dotenv()` dans ce module — c'est `cli.py` qui charge `.env` (sinon les tests qui veulent un environnement contrôlé sont parasités par le `.env` local).

---

## Module `db.py`

Toutes les opérations SQLite. Fonctions principales :

**Init** :
- `init_db(db_path)` — crée tables + index + WAL (idempotent)
- `connect(db_path)` — context manager (commit auto à la sortie)

**Mesures (water_level)** :
- `add_measure(db_path, date_str, hour_str, value, unit)` → bool (False si doublon)
- `measure_exists(db_path, date_str, hour_str)` → bool
- `load_all_measures(db_path)` → list[dict]
- `load_first_measure_per_day(db_path)` → list[dict] (utile pour les graphs annuels)
- `get_missing_days(db_path, start_date, end_date=None)` → list[str au format dd-mm-YYYY]

**Empty days** :
- `upsert_empty_day(db_path, iso_date)` — insère ou incrémente `attempts`
- `delete_empty_day(db_path, iso_date)` — supprime (utile si l'API publie en retard)
- `list_empty_days(db_path)` → list[str]

**GPT logs** :
- `log_gpt_call(db_path, model, prompt, response, prompt_tokens, completion_tokens, total_tokens, kind)`
- `get_last_gpt_response(db_path, kind)` → str | None

**Format des dates** : tout est en `dd-mm-YYYY` côté API Laetis, converti en ISO `YYYY-MM-DD` à l'écriture en DB. Les helpers gèrent les conversions internement.

---

## Module `api.py`

Un seul client HTTP, très simple.

```python
def fetch_day(date_str, *, base_url, auth_header, timeout_s=15.0) -> list[dict]:
    """
    Fetch measurements for a given day (format 'dd-mm-YYYY').
    Returns the list of chroniques (possibly empty).
    Raises LaetisAPIError on HTTP failure.
    """
```

- **URL** : `https://data.niv-eau.fr/hydro/lieu/198/{date_str}`
- **Header** : `laetis: Basic TGFldGlzTjF2ZWF1` (récupéré de la V1, valeur publique)
- **Timeout** : 15 s par défaut
- **`LaetisAPIError`** est levée sur status != 200

Format de réponse :
```json
{
  "id": 198,
  "chroniques": [
    {"date": "10-09-2024", "heure": "14:20", "valeur": 665.9, "unite": "mNGF"},
    ...
  ]
}
```

Si `chroniques: []`, le jour n'a pas de données (panne capteur, jour blanc).

---

## Module `scraper.py`

Orchestration de l'ingestion. **C'est le cœur du worker**.

### `process_day(db_path, date_str, *, api_base, auth)` — traite UN jour

```
1. Appelle api.fetch_day(date_str) → measures
2. age = (today - date_str).days

3. Si measures non vide :
     ├─ Insère chaque mesure (idempotent, doublons ignorés)
     └─ Si le jour était dans empty_days : delete_empty_day
        (cas : API a publié en retard, on récupère les données)

4. Sinon (measures vide) :
     ├─ Si age >= 7 jours : upsert_empty_day(date_str)
     │  (le jour est définitivement vide, on le marque pour ne pas retenter)
     └─ Sinon (age < 7) : no-op
        (l'API peut publier en retard, on retentera demain)
```

### `run_scraper(db_path, *, start_date, api_base, auth)` — boucle principale

```
1. missing = get_missing_days(db_path, start_date)
   ├─ exclut les jours déjà en DB
   └─ exclut les jours marqués empty_days

2. Pour chaque jour manquant :
     ├─ process_day(jour)
     └─ sleep aléatoire 0.1-0.5s (poli avec l'API)

3. process_day(today_str)
   (rafraîchir le jour en cours pour avoir les dernières mesures)

4. last_day = MAX(date_event) de la DB
   Si last_day != today :
     process_day(last_day)
     (rafraîchir le dernier jour publié au cas où des mesures arrivent après)
```

**Pourquoi rafraîchir today + last_day ?** L'API publie de manière streaming au fil de la journée. Si on a la mesure de 08:00 le matin et qu'on retourne à 14:00, on veut intégrer celles de 10:20, 10:40, etc.

---

## Module `kpi.py`

Calculs métier purs (pas d'IO, prennent en entrée une liste de mesures, retournent un dict).

### `compute_kpis(db_path) -> Kpis`

Retourne :
- `last_datetime` — date de la dernière mesure (`'YYYY-MM-DD HH:MM:SS'`)
- `level` — valeur de la dernière mesure (float)
- `vs_j1` — niveau actuel − niveau il y a 1 jour
- `vs_j3` — niveau actuel − niveau il y a 3 jours
- `vs_s1` — niveau actuel − niveau il y a 7 jours
- `trend_7d_m_per_day` — `vs_s1 / 7` (tendance moyenne en m/jour)

L'algorithme : pour chaque "X jours en arrière", on prend la mesure **la plus récente avant ou égale à `last_dt − X jours`** (pas exactement à cette date, mais la plus proche en deçà). Robuste aux trous dans les données.

### `compute_annual_comparison(db_path) -> {vs_y1, vs_y2, vs_y3}`

Compare le niveau actuel à celui des 3 dernières années à la même date.

**Fenêtre ±3 jours** : si pas de mesure exacte au "même jour" il y a 1 an, on prend la mesure la plus proche dans ±3 jours. Si pas de candidat → `None`.

> Cette duplication TS↔Python est volontaire : le worker calcule pour la phrase IA (1× par jour), Next.js calcule pour le rendu live des KPIs. Garder les 2 implémentations side-by-side évite un couplage et facilite les tests.

---

## Module `ai.py`

Génération des phrases IA via GPT-4o. Le timer systemd tape **toutes les heures à xx:55** ; `cli.ai_refresher_main` lit la table `ai_policy` et le module [`policy.py`](#module-policypy) décide si on génère ou si on skip.

### Prompts

Deux prompts distincts :
- **`build_commentary_prompt(kpis, thresholds)`** — pour la phrase de tendance ("Reculer le bateau, niveau actuel proche du seuil 'Ponton max'…")
- **`build_annual_prompt(kpis, current_year)`** — pour la comparaison annuelle ("Le niveau actuel est plus bas que les 3 dernières années à la même date.")

Les prompts incluent :
- Le contexte métier (bateau, ponton, tirant d'eau 0,4 m)
- Les valeurs courantes (niveau, deltas, tendance)
- Les seuils actifs
- Une instruction stricte : "UNE PHRASE" en français, claire et concise

### `call_openai(*, client, db_path, prompt, kind, max_tokens, temperature)`

Wrappe l'appel à `openai.chat.completions.create`. **Persiste systématiquement le résultat** dans `gpt_logs` (avec model, prompt, réponse, tokens).

Modèle : `gpt-4o`, température 0.7 pour tendance, 0.5 pour annual (moins de fantaisie).

### `run_ai_refresher(*, client, db_path) -> {tendance, comparaison_annuelle}`

Workflow complet :
1. `compute_kpis()` — si pas de mesures (DB vide), skip et retourne `{None, None}`
2. Charge les seuils actifs (`_load_thresholds`)
3. Construit et envoie le prompt "tendance" → log + return
4. `compute_annual_comparison()`
5. Construit et envoie le prompt "comparaison_annuelle" → log + return

**Coût** : ~600 tokens in + ~120 tokens out par appel × 2 appels = ~0,003€ par génération. Avec la cadence par défaut (4×/jour mai-août, 1×/jour reste de l'année) ≈ ~750 générations/an, soit **~2,3€/an** ou **~0,20€/mois**.

---

## Module `policy.py`

Logique de décision pure (pas de DB ni d'I/O), facile à tester. Le timer systemd appelle `cli.ai_refresher_main` toutes les heures ; ce dernier consulte la policy via :

```python
def should_generate_now(
    now_paris_naive: datetime,
    policy: dict,
    last_run_at_utc: datetime | None,
) -> tuple[bool, str]:
    if not policy.get("enabled"):
        return False, "disabled"

    if is_high_season(now_paris_naive, policy):
        allowed = _parse_csv_ints(policy["high_season_hours"])
        bucket = "high_season"
    else:
        allowed = _parse_csv_ints(policy["low_season_hours"])
        bucket = "low_season"

    if now_paris_naive.hour not in allowed:
        return False, f"{bucket}_off_hour"

    if last_run_at_utc is not None:
        last_paris = _utc_to_paris(last_run_at_utc)
        if now_paris_naive - last_paris < timedelta(minutes=MIN_GAP_MINUTES):
            return False, "too_recent"

    return True, bucket
```

### Fuseaux horaires (CRITIQUE)

- `now_paris_naive` est obtenu via `now_paris()` (utilise `zoneinfo.ZoneInfo("Europe/Paris")`).
- `last_run_at_utc` est lu depuis `ai_policy.last_run_at` (écrit par SQLite `CURRENT_TIMESTAMP`, donc UTC).
- La fonction convertit explicitement UTC→Paris avant le calcul de delta, sinon en été (UTC+2) on aurait un décalage permanent de 2h sur l'anti-doublon.

### Anti-doublon

`MIN_GAP_MINUTES = 50` : on ne régénère pas si la dernière génération réussie est plus récente que 50 min. Sécurise contre les ticks décalés du timer (`RandomizedDelaySec=2min`) et contre un `--force` suivi d'un tick naturel.

### `--force`

Le flag CLI `lac-ai-refresh --force` bypass la policy entière (utilisé par le bouton « Régénérer maintenant » du panel admin). Le résultat est tout de même écrit dans `last_run_at/status`, donc visible dans le UI.

### Tests

`worker/tests/test_policy.py` couvre 18 cas dont les transitions DST été/hiver (tests `test_dst_summer_no_anti_doublon_glitch` et `test_dst_winter_no_anti_doublon_glitch`).

---

## Module `migrate.py`

Migration **one-shot** V1 → V2, idempotente, à lancer 1× à la mise en service du VPS.

```python
def migrate_v1_to_v2(db_path: Path) -> None:
    init_db(db_path)   # idempotent : crée tables manquantes + index + WAL

    # Insère les 11 dates héritées de l'ancien ignore_dates.yaml
    for iso in V1_IGNORE_DATES:
        if iso not in existing:
            upsert_empty_day(db_path, iso)
```

Liste hardcodée (extraite de `ignore_dates.yaml @ v1.0.0`) :
```python
V1_IGNORE_DATES_DDMMYYYY = [
    "04-09-2021", "07-09-2021",
    "19-10-2022", "20-10-2022", "21-10-2022", "22-10-2022",
    "19-08-2023",
    "21-06-2024", "22-06-2024",
    "17-02-2025", "18-02-2025",
]
```

Si tu redéploies sur un VPS neuf : récupère la DB V1.0.0 (`git show v1.0.0:niveau_eau.db > niveau_eau.db`), copie sur le VPS, lance `lac-migrate`.

---

## Module `cli.py`

Les 3 fonctions appelées par les `[project.scripts]` du `pyproject.toml`.

```python
def scraper_main() -> int:
    _configure_logging()
    settings = get_settings()
    init_db(settings.db_path)
    summary = run_scraper(...)
    return 0

def ai_refresher_main() -> int:
    _configure_logging()
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    init_db(settings.db_path)
    policy = get_ai_policy(settings.db_path)

    if not args.force:
        last_run = parse_db_datetime(policy.get("last_run_at"))
        ok, reason = should_generate_now(now_paris(), policy, last_run)
        if not ok:
            log.info("ai_refresher skipped: %s", reason)
            return 0

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        result = run_ai_refresher(client=client, db_path=settings.db_path)
        mark_ai_run(settings.db_path, status="ok")
        return 0
    except Exception as exc:
        mark_ai_run(settings.db_path, status="failed", error=f"{type(exc).__name__}: {exc}")
        return 1

def migrate_main() -> int:
    _configure_logging()
    settings = get_settings()
    migrate_v1_to_v2(settings.db_path)
    return 0
```

`_configure_logging()` charge `.env` via `load_dotenv()` puis configure le logging vers stdout (capturé par journalctl côté systemd).

---

## Tests

**47 tests pytest** couvrent ~85% du code.

```bash
cd worker
make test            # uv run pytest -v
make test-cov        # avec coverage
```

Découpage :
- `test_config.py` (3) — chargement env
- `test_db.py` (21) — toutes les opérations SQLite + helpers KPIs
- `test_api.py` (4) — client Laetis (mocked HTTP)
- `test_scraper.py` (7) — process_day + run_scraper avec différents scénarios
- `test_kpi.py` (4) — KPIs avec datasets synthétiques
- `test_ai.py` (5) — prompts + OpenAI mocked
- `test_migrate.py` (3) — migration idempotente

**Stratégie** : tous les tests utilisent une **DB temporaire** (fixture `tmp_db`) pour ne jamais toucher la prod. OpenAI et Laetis sont **mockés** dans les tests.

---

## Logs en prod

```bash
# Live tail
make logs-scraper VPS=lac
make logs-ai VPS=lac

# Sur le VPS
sudo journalctl -u lac-scraper.service -f
sudo journalctl -u lac-ai.service -f

# Historique
sudo journalctl -u lac-scraper.service --since "1 hour ago"
```

Format type d'un run :
```
2026-05-15 23:00:39 INFO lac_worker.scraper: scraper: 0 missing days to process
2026-05-15 23:00:39 INFO lac_worker.cli: scraper done: {'missing_count': 0, 'today': '15-05-2026'}
```

---

## Pour aller plus loin

- Schéma DB détaillé : [02-database.md](02-database.md)
- Comment les services systemd sont configurés : [05-infrastructure.md](05-infrastructure.md)
- Procédures de déploiement : [06-operations.md](06-operations.md)
