# CLAUDE.md — Lac des Saints Peyres (V2)

Contexte pour Claude sur ce projet. Lis-moi avant de toucher au code.

---

## Le projet en 30 secondes

App perso de suivi du niveau du lac des Saints Peyres (Tarn). Utilisateur final : **papa**, qui amarre un bateau au lac et consulte plusieurs fois par jour depuis son iPhone (PWA installée). Le détail métier (les 2 pontons fixe + amovible, le tirant d'eau, la calibration sondeur) est dans [README.md](./README.md) et [docs/](./docs/).

Stack :
- **Worker Python** (`worker/`) — scraping Laetis toutes les 20min + génération IA (GPT-5) selon une policy. Géré par `uv`, lancé via systemd timers.
- **Next.js 15** (`web/`) — App Router, Server + Client Components, ECharts, better-sqlite3.
- **SQLite** — un seul fichier `niveau_eau.db` partagé entre worker et web, mode WAL.
- **OVH VPS-1** Ubuntu 24.04, Caddy (TLS auto), domaine `gothis.duckdns.org`.

Pour les détails techniques, **lis [docs/](./docs/)** avant de demander.

---

## Workflow de travail attendu

1. **L'utilisateur préfère le dialogue à la production immédiate.** Pour toute feature non triviale, pose des questions de cadrage avant de coder. Il a explicitement dit plusieurs fois : "pose des questions avant de faire des suppositions".
2. **Toujours montrer en dev local avant deploy.** Le pattern : code → dev server → curl/screenshot pour vérif → valide-avec-moi → commit → push → deploy.
3. **Commits atomiques par étape.** Pas de gros commit fourre-tout. Un commit par feature/fix bien cadré.
4. **Le user dit "go deploy" quand il est prêt.** Ne jamais déployer sans confirmation explicite.

---

## Conventions de code

### Général
- **Français pour les commits, comments, UI, docs.** Anglais OK pour les noms techniques (fonctions, variables, types).
- **Pas d'emoji dans le code** sauf si UI (les emojis dans labels UI sont OK : 💧, 📈, ⚙️, 📐, ⚓, 📍, 🤖).
- Pas de tests pour les tests. Mais pytest est exigé côté worker pour la logique pure (policy, kpi, ai). Côté web, vitest light pour les helpers purs uniquement (formatDelta, etc.).

### Python (worker/)
- `uv` pour tout (deps + lockfile + run). Jamais `pip` direct.
- TDD light : tests pytest dans `worker/tests/`, conftest fournit `tmp_db`.
- Schema SQLite défini dans `worker/src/lac_worker/db.py::SCHEMA`. Migrations idempotentes via `_migrate_*` fonctions + ALTER TABLE conditionnel sur `PRAGMA table_info`.

### TypeScript (web/)
- Server Components par défaut, `"use client"` uniquement quand nécessaire (interactivité, localStorage, fetch côté client).
- **Auto-bootstrap idempotent côté Next.js** : chaque helper DB (`getDisplaySettings`, `getAiPolicy`, etc.) appelle un `ensure*()` qui crée table + ligne par défaut si absentes. Le frontend ne dépend pas du worker pour démarrer.
- Validation des bodies API avec Zod.
- Sessions admin via iron-session (cookie `HttpOnly Secure SameSite=Strict`).

---

## Pièges connus (très important)

### 1. JSX whitespace bug avec SWC (Next.js 16)
Sur certaines lignes longues multilignes, **SWC élide silencieusement l'espace entre une balise inline fermante et le texte qui suit**. Ex : `<strong>texte</strong> Suite...` rendu en `<strong>texte</strong>Suite...`.

**Solution** : utiliser `{" "}` JSX explicite entre la balise et le texte :
```tsx
<strong>texte</strong>{" "}Suite du paragraphe...
```

Audit rapide via curl + grep `</strong>[a-z]` ou similaire pour détecter.

### 2. SQLite CURRENT_TIMESTAMP est en UTC
Toute logique qui compare un timestamp DB (`CURRENT_TIMESTAMP`) avec `datetime.now()` doit faire la conversion explicite. Voir `worker/src/lac_worker/policy.py::_utc_to_paris` pour le pattern.

### 3. systemd ProtectHome sur lac-web.service
Doit être `read-only` (pas `true`), sinon `/usr/local/bin/uv` (symlink vers `/home/app/.local/bin/uv`) est inaccessible et `/api/admin/ai/regenerate` plante silencieusement.

### 4. Le push gitignore-ignore `web/src/lib/`
Le `.gitignore` global ignore `lib/` (pattern Python venv). Quand on ajoute un fichier dans `web/src/lib/`, il faut `git add -f` la première fois. Les fichiers déjà trackés (db.ts, levelDisplay.ts) sont OK.

### 5. better-sqlite3 native binding
Build sur macOS ne marche pas sur Linux. **Le build doit se faire sur le VPS** (le Makefile `deploy-web` rsync les sources puis `npm ci && npm run build` sur le VPS).

### 6. GPT-5 vs GPT-4o paramètres API
GPT-5 utilise `max_completion_tokens` au lieu de `max_tokens` et expose `reasoning_effort` (que `gpt-4o` ne supporte pas). Le code (`worker/src/lac_worker/ai.py::call_openai`) conditionne les kwargs selon `MODEL.startswith("gpt-5")`. Si on veut revenir sur 4o, juste changer la constante `MODEL`.

---

## Commandes utiles

### Dev local
```bash
# Worker (Python)
cd worker
uv run pytest                    # tests
uv run lac-scraper               # scraping manuel
uv run lac-ai-refresher --force  # forcer une génération IA

# Web (Next.js)
cd web
PORT=3456 npm run dev   # dev server (.env.local fournit DB path + mdp admin local)
```

### Deploy
```bash
make deploy VPS=lac      # rsync + build + restart (worker + web + caddy reload)
make deploy-web VPS=lac  # juste le web
make restart VPS=lac     # juste un restart
make status VPS=lac      # statut systemd
make logs VPS=lac        # logs web en live
make logs-ai VPS=lac     # logs worker AI
```

`VPS=lac` est l'alias SSH dans `~/.ssh/config`.

### Migration systemd
Les unités sont versionnées dans `infra/systemd/`. Pour push une modif :
```bash
scp infra/systemd/<unit> lac:/tmp/
ssh lac "sudo mv /tmp/<unit> /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart <unit>"
```

### Inspection DB prod
```bash
ssh lac "sudo sqlite3 /var/lib/lac/niveau_eau.db 'SELECT ... '"
```

### Mots de passe admin
- Local (`web/.env.local`) : `stan`
- Prod : `gothis1234`

---

## Architecture des tables SQLite (V2.3)

| Table | Rôle |
|---|---|
| `water_level` | mesures Laetis (1/20min) |
| `threshold_line` | seuils visuels (lignes graphs + injection prompt IA) |
| `gpt_logs` | historique générations IA (system_prompt + prompt + response + tokens) |
| `empty_days` | jours sans donnée API (auto-marqués après 7j) |
| `ai_policy` | singleton (id=1) : cadence + state du worker IA |
| `display_settings` | singleton (id=1) : 2 calibrations + tirant + marge + system prompt |
| `calibration_history` | log des étalonnages (tag ponton fixe/amovible) |
| `system_prompt_history` | versions successives du system prompt édité |

---

## Style de communication

- **Court et factuel.** Pas de paragraphes introductifs ("Bien sûr, je vais...").
- **Pas de récap qui rappelle ce que je viens de dire.** Le user voit les diffs.
- **Si je modifie un fichier, j'annonce ce que je fais en une phrase max.**
- **À la fin d'une étape : une ligne résumé + ce qui reste à valider.** Rien d'autre.
- Le user n'aime pas les "wrappings" de courtoisie. Direct.

---

## Pour aller plus loin

- [docs/01-architecture.md](docs/01-architecture.md) — vue d'ensemble
- [docs/02-database.md](docs/02-database.md) — schéma SQLite détaillé
- [docs/03-worker-python.md](docs/03-worker-python.md) — modules worker, policy, ai
- [docs/04-frontend.md](docs/04-frontend.md) — pages, composants, routes API, DisplayProvider
- [docs/05-infrastructure.md](docs/05-infrastructure.md) — VPS, systemd, Caddy
- [docs/06-operations.md](docs/06-operations.md) — runbook deploy/debug/rollback
- [docs/07-security.md](docs/07-security.md) — secrets, hardening
- [docs/08-glossary.md](docs/08-glossary.md) — mNGF, PWA, WAL, référentiels…
- [docs/09-history.md](docs/09-history.md) — historique V1 → V2.3 avec rationale
