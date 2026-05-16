# 04 — Frontend Next.js

Application **Next.js 15** (App Router, React 19, TypeScript) qui sert le front PWA mobile-first à destination de l'iPhone de papa.

---

## Vue d'ensemble

```
web/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example
├── public/                       ← assets statiques + PWA
│   ├── manifest.webmanifest
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── src/
│   ├── app/                      ← App Router
│   │   ├── layout.tsx            ← root layout + AppShell + bootstrap thème
│   │   ├── globals.css
│   │   ├── page.tsx              ← / (Niveau actuel — émoji 💧)
│   │   ├── _DaysSelectorWithChart.tsx
│   │   ├── _ColoredCurveChart.tsx   ← graph coloré par segment (Now)
│   │   ├── annuel/
│   │   │   ├── page.tsx          ← /annuel (Comparaison annuelle + Histo — émoji 📈)
│   │   │   ├── _AnnualChart.tsx
│   │   │   └── _FullHistoryChart.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx          ← /admin (panel admin protégé)
│   │   │   └── _AdminClient.tsx
│   │   ├── options/
│   │   │   ├── page.tsx          ← /options (émoji ⚙️)
│   │   │   └── _OptionsClient.tsx
│   │   └── api/                  ← 12 route handlers
│   │       ├── water/recent/route.ts
│   │       ├── water/yearly/route.ts
│   │       ├── water/full/route.ts
│   │       ├── ai/commentary/route.ts
│   │       ├── thresholds/route.ts
│   │       ├── thresholds/[id]/route.ts
│   │       ├── auth/login/route.ts
│   │       ├── auth/logout/route.ts
│   │       └── health/route.ts
│   ├── components/               ← composants UI partagés
│   │   ├── AppShell.tsx          ← header + bottom nav
│   │   ├── BottomNav.tsx         ← 3 émojis (💧 📈 ⚙️)
│   │   ├── AIBanner.tsx          ← carte bleue avec la phrase IA
│   │   ├── LevelHero.tsx         ← gros niveau actuel + date dernière mesure
│   │   ├── KpiGrid.tsx           ← grille 2×2 des deltas
│   │   ├── DaysSelector.tsx
│   │   ├── YearSelector.tsx
│   │   └── WaterChart.tsx
│   └── lib/
│       ├── db.ts                 ← better-sqlite3 + queries
│       ├── kpi.ts                ← compute KPIs (mirror Python)
│       ├── session.ts            ← iron-session config
│       └── auth.ts               ← getSession / requireAdmin
└── tests/
    └── kpi.test.ts               ← 4 tests Vitest
```

---

## App Router : pages vs composants client

Next.js App Router fait du **Server-Side Rendering par défaut**. Les composants sont **Server Components** sauf indication contraire (`"use client";` en haut du fichier).

**Pourquoi c'est important** :
- Les **Server Components** peuvent appeler directement `getDb()`, lire la DB SQLite, faire du SSR ultra-rapide
- Les **Client Components** (charts, sélecteurs interactifs) doivent passer par les routes API pour parler à la DB

Convention de nommage utilisée : les composants client commencent par `_` (ex: `_DaysSelectorWithChart.tsx`) — c'est juste une convention pour signaler "ce fichier porte le `"use client"`".

---

## Les 4 pages

### `/` — émoji 💧 (Niveau actuel)

**Server Component** qui :
1. Appelle `getRecentMeasures(7)` côté serveur
2. Calcule les KPIs avec `computeKpis()`
3. Récupère la phrase IA + son âge en minutes via `getLatestAICommentaryWithAge('tendance')`
4. Récupère les seuils `getThresholds()` + la ligne auto `getAutoZeroLine()`

Ordre d'affichage (top to bottom) :
1. **`<AIBanner>`** — phrase IA (cadence selon `ai_policy`, par défaut 4×/jour en haute saison, 1×/jour en basse saison) + âge à droite (« il y a X min »)
2. **`<LevelHero>`** — gros bloc avec le niveau actuel en grand + date de la dernière mesure à droite (date + heure + délai relatif)
3. **`<KpiGrid>`** — grille 2×2 des deltas (Tendance 7 j, VS hier, VS 3 j, VS sem.)
4. **`<DaysSelectorWithChart>`** — chips 1/3/7/14/30/60/90/180/365 j + graph (avec ligne auto "Coque touche le fond" + seuils admin)

`DaysSelectorWithChart` est **Client** (interactif) : il garde le N jours en `useState` + `localStorage`, fait `fetch('/api/water/recent?days=N')` quand N change. **Défaut : 3 jours**.

Le graph est rendu par **`<ColoredCurveChart>`** (composant dédié à la page Now) :
- Resample des mesures par tranches de N heures (1 h pour 3 jours, jusqu'à 24 h pour 1 an).
- Pour chaque segment, calcul de la pente locale (m/heure).
- **Chaque segment a sa propre couleur** :
  - Pente > +threshold → vert vif `rgb(0,255,0)`
  - Pente > 0 mais < +threshold → vert foncé `rgb(0,150,0)`
  - Pente < 0 mais > -threshold → rouge foncé `rgb(150,0,0)`
  - Pente < -threshold → rouge vif `rgb(255,0,0)`

C'est le **même algorithme que la V1 Streamlit** (`webapp/plotly_chart.py::create_interactive_chart_plotly`), porté en TypeScript/ECharts.

### `/annuel` — émoji 📈 (Comparaison annuelle + Historique)

Cette page contient **deux sections** dans cet ordre :

1. **Comparaison annuelle** — `<AnnualChart>`
   - KPIs annuels (VS Y-1, VS Y-2, VS Y-3) calculés avec `computeAnnualKpis()`
   - Multi-select chips des années dispos (défaut : 4 dernières)
   - Graph qui superpose les années sur un axe X normalisé à une année calendaire (les `date_event` sont remplacées par `2000-MM-DD` pour aligner)
   - L'AIBanner annuel a été supprimé en V2.3 (la phrase doublonnait les KPIs)

2. **Historique complet depuis 2021-07-07** — `<FullHistoryChart>`
   - Une série ECharts par année avec sa propre couleur (palette de 6 couleurs cyclée)
   - Permet de voir les cycles saisonniers d'un coup d'œil
   - DataZoom slider en bas pour explorer une période

### `/admin` (protégée par mot de passe)

Pas de titre de page (juste un lien « Déconnexion » en haut à droite). 4 sections **collapsibles** (`<details>` natifs HTML), seule la première est ouverte par défaut :

1. **📐 Étalonnage du ponton** (V2.3, ouvert par défaut) — gère les 2 calibrations en parallèle (ponton fixe + amovible). 2 cartes en haut affichent la calibration courante de chaque ponton avec un badge « ● actif » sur celui du dernier étalonnage. Formulaire : niveau actuel **en lecture seule** (depuis `/api/water/recent?days=1`) + radio « Ponton fixe / amovible » + profondeur sondeur (éditable) + note optionnelle. Chaque enregistrement insère dans `calibration_history` ET met à jour la calibration courante du ponton concerné dans `display_settings`. Historique des 5 derniers étalonnages en dépliable.
   - **Bouton « 🚤 Ranger l'amovible (revenir au ponton fixe) »** : apparaît uniquement si `active_ponton === "amovible"` et qu'une calibration fixe existe. Sert quand on range le bateau et que l'amovible n'est plus sur l'eau. Confirmation JS, puis POST `/api/admin/display/archive-amovible` qui insère une entrée `calibration_history` avec `ponton=fixe` + note `"Retour au ponton fixe (rangement amovible)"`, et remet `ponton_amovible_calibration_mngf` à NULL.

2. **⚓ Bateau** (V2.3) — 2 champs : tirant d'eau (m, défaut 0,80) et marge de vigilance (m, défaut 0,30). Les **2 seuils opérationnels** sont dérivés et affichés en read-only (seuil critique = tirant 0,80 m, seuil vigilance = tirant + marge = 1,10 m). Stocké dans `display_settings.boat_draft_m` + `vigilance_margin_m`.

3. **📍 Seuils visuels** — bloc explicatif "À quoi servent les seuils ?" (2 usages : lignes sur les graphs + injection dans le prompt IA) puis CRUD complet de la table `threshold_line`.

4. **🤖 Phrases IA** (V2.1 + V2.3) — pilotage complet :
   - **Policy** (V2.1) : toggle activé/désactivé, 12 checkboxes mois haute saison, 24 checkboxes heures (haute saison en bleu, basse saison en gris), bouton « 🔄 Régénérer maintenant » (rate-limit 1×/5 min, spawn `lac-ai-refresher --force`), statut dernière génération.
   - **System prompt** (V2.3) : textarea modifiable + bouton « Restaurer le défaut » + historique des éditions (depliable, chaque version peut être restaurée). Stocké dans `display_settings.ai_system_prompt`, archivé dans `system_prompt_history` à chaque modification.
   - **📊 Historique des générations** (V2.3) : 20 dernières entrées de `gpt_logs`. Chaque ligne est dépliable et montre **system prompt complet + user prompt complet + réponse + tokens** pour un audit/monitoring total.

### `/options` — émoji ⚙️

Page client (`_OptionsClient.tsx`) avec 5 sections dans cet ordre :

1. **Affichage du niveau** (V2.2) — 3 radios `Altitude (mNGF) / Sous le ponton / Depuis le minimum historique`. Le mode « Sous le ponton » est grisé si l'admin n'a pas étalonné. Switch immédiat via `useDisplay()`.
2. **Thème** — radio buttons `Système / Clair / Sombre`, persisté en `localStorage`. Switch immédiat via toggle de la classe `dark` sur `<html>`.
3. **Comment ça marche ?** — accordions `<details>` qui détaillent les calculs :
   - D'où viennent les mesures (Laetis API, 20 min)
   - C'est quoi le mNGF
   - « Sous le ponton » / « Depuis le minimum » : c'est quoi ces référentiels ?
   - Comment on calcule VS hier / 3 j / sem.
   - C'est quoi la Tendance 7 j
   - Comment fonctionne la comparaison annuelle (avec exemple concret, fenêtre ±3 j)
   - Que montrent exactement les graphs (les 3 graphs détaillés)
   - **La phrase IA** (V2.3+ : une seule, "tendance", GPT-5, cadence réglable, stockage en DB ; l'âge est affiché dans le bandeau)
   - À quoi servent les seuils
4. **Monitoring** — état du backend en live :
   - Dernière mesure (avec point d'état vert/orange/rouge selon l'âge ; timestamp local Paris)
   - Dernière phrase IA + âge en minutes calculé en SQL (cf. piège timezone plus bas)
   - Mesures stockées (count)
   - Taille de la DB (MB)
5. **Panel admin** — bouton vers `/admin` avec note explicative.

---

## Référentiel d'affichage (V2.2)

Le niveau du lac est stocké en mNGF (cf [08-glossary.md](08-glossary.md)) mais peut être affiché dans 3 référentiels :

| Mode | Calcul | Quand c'est utile |
|---|---|---|
| `mngf` | brut | référence historique (défaut) |
| `ponton` | `value − ponton_calibration_mngf` | quotidien navigateur |
| `min` | `value − min(water_level)` | "à quel point on est haut" |

**Architecture** : un seul Provider client `<DisplayProvider>` au layout. Il :
1. lit `localStorage.lac-display-mode` au mount (default `mngf`) ;
2. fetch `/api/display/settings` (cache 5 min) pour récupérer `{ponton_calibration_mngf, min_historical}` ;
3. expose `{mode, refs, ready, setMode}` aux enfants via `useDisplay()` ;
4. bascule en `mngf` si le mode stocké n'est plus disponible (admin a effacé la calibration).

**Helpers** (`src/lib/levelDisplay.ts`) :
- `convertValue(v_mngf, mode, refs)` — retourne la valeur convertie, ou `null` si conversion impossible.
- `formatLevel(v_mngf, mode, refs)` — string formaté pour affichage.
- `formatDelta(delta_m)` — auto-switch m↔cm (|delta|<1m → cm).
- `formatRelativeMeters(v)` — pour les valeurs absolues dans un référentiel relatif.
- `unitLabel(mode)` — label court pour les axes ECharts ("m NGF" / "m sous coque" / "m depuis min.").

**Composants qui consomment** :
- `LevelHero` — valeur principale + mNGF en gris si on n'est pas en mNGF.
- `KpiGrid` — auto-cm pour deltas/tendance < 1m.
- `WaterChart` + `ColoredCurveChart` — axe Y converti, tooltip converti, lignes de seuil converties. `valueFormatter`/`axisLabel.formatter` forcent `toFixed(2)` pour éviter les "2.299999996" liés aux flottants.

**Le réglage est personnel** (localStorage côté browser, comme le thème). L'étalonnage du ponton est lui partagé entre tous les visiteurs (table `display_settings`).

---

## Composants UI partagés

| Composant | Type | Rôle |
|---|---|---|
| `AppShell` | Server | Header sticky "💧 Saints Peyres" + indicateur "Mis à jour il y a N min" + bottom nav |
| `DisplayProvider` | Client | Wrap layout, fournit `useDisplay()` (mode courant + refs calibration/min). |
| `BottomNav` | Client | Barre nav iOS-style fixe en bas, **3 émojis seuls** (💧 / 📈 / ⚙️), opacité réduite quand inactif. **Badge rouge ⚠️** sur ⚙️ si `last_run_status='failed'` (poll `/api/ai/status` toutes les 5 min). |
| `AIBanner` | Server | Carte bleue avec ✨ + phrase IA + âge à droite (« il y a X min/h/j »). Fallback "Pas de commentaire disponible" si aucune phrase. |
| `LevelHero` | Server | Bloc d'en-tête de la page Now : gros niveau actuel + date/heure de la dernière mesure (alignés) |
| `KpiGrid` | Server | Grille 2×2 des deltas (Tendance 7 j, VS hier, VS 3 j, VS sem.) — pas de "niveau actuel" ni "dernier relevé" (ils sont dans `<LevelHero>`) |
| `DaysSelector` | Client | Chips tactiles `1 j · 3 j · 7 j · 14 j · 30 j · 60 j · 90 j · 180 j · 365 j` (V2.1+) |
| `YearSelector` | Client | Chips d'années toggleables (multi-select) |
| `WaterChart` | Client | Wrapper ECharts générique (multi-lines, seuils, dataZoom) — utilisé pour Annuel + Histo |
| `ColoredCurveChart` (sous `app/`) | Client | Wrapper ECharts spécifique au Now : courbe segmentée colorée par pente locale |

---

## Le composant `ColoredCurveChart` (graph segmenté par pente)

Spécifique à la page Now, reproduit le comportement Streamlit V1.

**Algorithme** :
1. Resample les mesures par buckets de `segmentSizeHours` heures (moyenne sur le bucket)
2. Pour chaque paire de points consécutifs, calcule la pente `(y2-y1) / segmentSizeHours` (m/heure)
3. Pour chaque segment, mappe la pente à une couleur RGB saturée
4. Crée une mini-série ECharts par segment (silent: true, hors tooltip)
5. Une série invisible supplémentaire porte le tooltip groupé + les `markLine` (seuils)

**Paramètres adaptatifs selon la fenêtre** (cf. `_DaysSelectorWithChart`) :

| Fenêtre | `segmentSizeHours` | `slopeThreshold` (m/h) | Nb de segments |
|---|---|---|---|
| 1 jour | 1 h | 0.040 | ~24 |
| 3 jours | 1 h | 0.030 | ~72 |
| 7 jours | 2 h | 0.025 | ~84 |
| 14 jours | 3 h | 0.020 | ~112 |
| 30 jours | 6 h | 0.015 | ~120 |
| 60 jours | 8 h | 0.012 | ~180 |
| 90 jours | 12 h | 0.010 | ~180 |
| 180 jours | 18 h | 0.009 | ~240 |
| 365 jours | 24 h | 0.008 | ~365 |

---

## Le composant `WaterChart` (graph générique)

Utilisé par `/annuel` (les 2 graphs). Wrapper autour de `echarts-for-react`. Gère :

1. **Lignes multiples** — légende activée si > 1 ligne. Positionnée en **haut** du chart (pas en bas) pour ne pas chevaucher l'axe X sur mobile.
2. **Gradient sous la courbe** quand il n'y a qu'une seule ligne.
3. **Seuils horizontaux** via `markLine` ECharts sur la 1ère série. **Labels désactivés** (`label.show: false`) depuis V2.3+ : avec 4 lignes sur ~3 m d'écart en mNGF, les noms se chevauchaient sur mobile et restaient illisibles. L'identification se fait depuis `/admin > 📍 Seuils visuels`.
4. **`dataZoom` inside** : pinch-zoom et pan natifs sur mobile.
5. **`touch-action: none`** en CSS pour bloquer le pinch-zoom de la page.

**Bug fix important** : `color` est mis à 3 endroits (top-level série + `itemStyle.color` + `lineStyle.color`) pour que le marker du tooltip ait bien la même couleur que la ligne (ECharts utilise `color` au top-level pour le marker, pas `lineStyle.color`).

---

## Ligne auto « Coque touche le fond » (V2.3+)

Sur les 3 graphs (page d'accueil + page 📈 × 2), une ligne horizontale est tracée **automatiquement** au niveau de la calibration mNGF du ponton actif. Elle représente le seuil où la coque touche le fond.

- Calculée côté serveur par `getAutoZeroLine()` dans `lib/db.ts` : récupère `getActivePonton()`, lit la calibration correspondante dans `display_settings`, retourne un `ChartThreshold` (trait plein rouge, `width: 2`).
- Concaténée **en tête** de la liste passée au composant chart (`page.tsx` et `annuel/page.tsx`) pour rester visuellement au-dessus.
- Distincte des `threshold_line` admin par son style : trait **plein épais rouge** vs. les seuils admin **fins pointillés**.
- Renvoyée `null` si aucun étalonnage n'a jamais été fait → pas de ligne sur les graphs (état initial).

---

## AIBanner avec âge (V2.3+)

Le bandeau IA en haut de la page d'accueil affiche désormais l'âge de la phrase à droite (« il y a X min », « il y a X h », « il y a X j »).

**Piège timezone** : `gpt_logs.created_at` est stocké en **UTC** (CURRENT_TIMESTAMP SQLite, sans suffixe Z). Si on calcule l'âge côté JS via `new Date("YYYY-MM-DD HH:MM:SS")`, JS interprète le string comme **local time** (Paris CEST = UTC+2 en été) → +2h d'erreur.

**Solution** : on calcule l'âge en **SQL côté serveur** via `strftime('%s','now') - strftime('%s', created_at)` et on passe `ageMinutes` au composant. Cf. `getLatestAICommentaryWithAge()` dans `lib/db.ts` et la query dédiée dans `options/page.tsx` (Monitoring).

À ne pas confondre avec `water_level.datetime_event` qui est stocké en **heure locale Paris** (parsé depuis le HTML Laetis) — pour celui-là `new Date(...)` côté JS interprète comme local et tombe juste par chance.

---

## DisplayProvider — refetch sur navigation (V2.3+)

Le `DisplayProvider` charge les références (calibration ponton, min historique) une fois et les expose via `useDisplay()`. Il est branché au layout racine donc ne se re-mount jamais.

**Sans refetch sur navigation** : après un étalonnage dans `/admin`, l'utilisateur revient sur `/` → les graphs et le `LevelHero` en mode "Sous le ponton" affichaient l'ancienne calibration (bug remonté en prod).

**Fix** : `useEffect(... [pathname])` dans `DisplayProvider.tsx`. À chaque changement de route, un GET `/api/display/settings` recharge les refs. Coût négligeable (1 fetch léger par navigation).

---

## Routes API

Toutes en `export const dynamic = "force-dynamic"` pour empêcher Next.js de tenter de SSG-er du contenu DB-dépendant à build time.

### Lecture (publique, aucune auth)

```
GET /api/water/recent?days=N        → mesures détaillées (datetime + value) sur N jours
GET /api/water/yearly?years=2025,…  → 1 mesure/jour par année (la première du jour)
GET /api/water/full                 → 1 mesure/jour depuis 2021-07-07
GET /api/ai/commentary              → dernière phrase IA tendance (legacy `?kind` ignoré)
GET /api/ai/status                  → { last_run_at, last_run_status } — consommé par BottomNav (badge ⚠️)
GET /api/display/settings           → { ponton_calibration_mngf, active_ponton, min_historical } — consommé par DisplayProvider
GET /api/thresholds                 → liste des seuils actifs
GET /api/health                     → { status, last_measure_age_min, db_size_mb }
```

`/api/health` renvoie **HTTP 200** si la dernière mesure date de < 120 min, **HTTP 503** sinon.

### Mutations (admin seulement)

```
POST   /api/thresholds                          → créer un seuil
PUT    /api/thresholds/:id                      → modifier
DELETE /api/thresholds/:id                      → soft delete
POST   /api/auth/login                          → cookie de session signée
POST   /api/auth/logout                         → vide le cookie

GET/POST /api/admin/ai/policy                   → cadence IA (mois 1..12, heures 0..23)
POST   /api/admin/ai/regenerate                 → spawn `lac-ai-refresher --force` (rate-limit 1×/5min)
GET    /api/admin/ai/history?limit=N            → N dernières entrées gpt_logs (audit)
GET/POST /api/admin/ai/system-prompt            → lit/écrit le system prompt IA
GET    /api/admin/ai/system-prompt/history      → snapshots successifs du system prompt

GET/POST /api/admin/display/calibration         → étalonner un ponton (fixe ou amovible)
POST   /api/admin/display/archive-amovible      → revenir au ponton fixe (rangement V2.3+)
GET/POST /api/admin/boat                        → tirant d'eau + marge de vigilance
```

**Validation des bodies** : Zod (range 600-700m, hex color, etc.).

---

## DB Layer (`src/lib/db.ts`)

Wrapper `better-sqlite3`. **Singleton** : une seule instance Database réutilisée à chaque requête.

```typescript
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath(), { readonly: false });
  _db.pragma("journal_mode = WAL");
  return _db;
}
```

`better-sqlite3` est **synchrone** (pas d'async/await). Plus rapide qu'un driver async pour SQLite local.

---

## KPI Layer (`src/lib/kpi.ts`)

**Mirror TypeScript** de `worker/src/lac_worker/kpi.py`. Cf. [03-worker-python.md](03-worker-python.md) section "Module kpi.py" pour les algorithmes détaillés (mêmes formules ici).

---

## Auth (`src/lib/auth.ts` + `src/lib/session.ts`)

**Stateless** : pas de table `users`, pas de table `sessions`. Cookie HttpOnly + Secure + SameSite=Strict, chiffré via `iron-session`. Cf. [07-security.md](07-security.md).

---

## Thème (Système / Clair / Sombre)

**Implémentation** :

1. **Tailwind 4** : on override le variant `dark:` pour qu'il s'applique uniquement quand la classe `.dark` est sur `<html>` :
   ```css
   /* globals.css */
   @custom-variant dark (&:where(.dark, .dark *));
   ```

2. **Bootstrap dans `<head>`** (avant le rendu, pour éviter le flash) :
   ```html
   <script>
   const pref = localStorage.getItem('lac-theme') || 'system';
   const isDark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
   if (isDark) document.documentElement.classList.add('dark');
   </script>
   ```

3. **Toggle** depuis la page Options : update du `localStorage` + toggle de la classe `dark`.

Conséquence : 3 modes vraiment indépendants.

---

## PWA (Progressive Web App)

Voir [05-infrastructure.md](05-infrastructure.md) section PWA pour les détails (manifest, icon-*.png, apple-touch-icon, etc.).

L'app est installable depuis Safari iPhone : **Partager → "Sur l'écran d'accueil"**.

---

## Mode dark/light

Voir section "Thème" plus haut. Par défaut suit `prefers-color-scheme` ; l'utilisateur peut forcer Clair ou Sombre depuis `/options`.

---

## Tests

**4 tests Vitest** dans `tests/kpi.test.ts`. On ne teste **que la logique pure** (compute KPIs). L'UI est testée visuellement (en dev sur le Mac, puis sur l'iPhone réel).

```bash
cd web
npx vitest run
```

---

## Build et déploiement

**Build local (dev)** :
```bash
cd web
npm run dev          # http://localhost:3000, hot reload
```

**Build prod** : `make deploy VPS=lac` depuis le repo root. Le build se fait **sur le VPS** (pas localement) pour que les bindings natifs de `better-sqlite3` correspondent à l'architecture Linux x86_64.

---

## Variables d'environnement

`web/.env.local.example` :

```bash
LAC_DB_PATH=../niveau_eau.db
ADMIN_PASSWORD=changeme
SESSION_PASSWORD=at-least-32-chars-long-random-here
```

Sur le VPS : `/opt/lac/web/.env.production` (chargé par systemd via `EnvironmentFile=`).

---

## Pour aller plus loin

- Comment systemd déclenche tout ça : [05-infrastructure.md](05-infrastructure.md)
- Procédure de déploiement step-by-step : [06-operations.md](06-operations.md)
- Modèle de sécurité (auth, secrets, HTTPS) : [07-security.md](07-security.md)
