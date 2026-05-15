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
│   │   └── api/                  ← 9 route handlers
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
3. Récupère la phrase IA `getLatestAICommentary('tendance')`
4. Récupère les seuils `getThresholds()`

Ordre d'affichage (top to bottom) :
1. **`<AIBanner>`** — phrase IA générée chaque matin
2. **`<LevelHero>`** — gros bloc avec le niveau actuel en grand + date de la dernière mesure à droite (date + heure + délai relatif)
3. **`<KpiGrid>`** — grille 2×2 des deltas (Tendance 7 j, VS hier, VS 3 j, VS sem.)
4. **`<DaysSelectorWithChart>`** — chips 3/7/30/90/365 j + graph

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
   - Phrase IA "comparaison annuelle" en haut
   - KPIs annuels (VS Y-1, VS Y-2, VS Y-3) calculés avec `computeAnnualKpis()`
   - Multi-select chips des années dispos (défaut : 4 dernières)
   - Graph qui superpose les années sur un axe X normalisé à une année calendaire (les `date_event` sont remplacées par `2000-MM-DD` pour aligner)

2. **Historique complet depuis 2021-07-07** — `<FullHistoryChart>`
   - Une série ECharts par année avec sa propre couleur (palette de 6 couleurs cyclée)
   - Permet de voir les cycles saisonniers d'un coup d'œil
   - DataZoom slider en bas pour explorer une période

### `/admin` (protégée par mot de passe)

Bloc explicatif "À quoi servent les seuils ?" en tête (explique les 2 usages : graphs + prompt GPT), puis CRUD complet des seuils.

### `/options` — émoji ⚙️

Page client (`_OptionsClient.tsx`) avec 4 sections :

1. **Thème** — radio buttons `Système / Clair / Sombre`, persisté en `localStorage`. Switch immédiat via toggle de la classe `dark` sur `<html>`.
2. **Monitoring** — état du backend en live :
   - Dernière mesure (avec point d'état vert/orange/rouge selon l'âge)
   - Dernière phrase IA tendance + date relative
   - Dernière phrase IA annuelle + date relative
   - Mesures stockées (count)
   - Taille de la DB (MB)
3. **Administration** — bouton vers `/admin` avec note explicative.
4. **Comment ça marche ?** — 7 accordions `<details>` qui détaillent les calculs :
   - D'où viennent les mesures (Laetis API, 20 min)
   - Comment on calcule VS hier / 3 j / sem.
   - C'est quoi la Tendance 7 j
   - Comment fonctionne la comparaison annuelle (avec exemple concret, fenêtre ±3 j)
   - Que montrent exactement les graphs (les 3 graphs détaillés)
   - Les 2 phrases IA (tendance + annuelle, génération matinale, stockage en DB)
   - À quoi servent les seuils

---

## Composants UI partagés

| Composant | Type | Rôle |
|---|---|---|
| `AppShell` | Server | Header sticky "💧 Saints Peyres" + indicateur "Mis à jour il y a N min" + bottom nav |
| `BottomNav` | Client | Barre nav iOS-style fixe en bas, **3 émojis seuls** (💧 / 📈 / ⚙️), opacité réduite quand inactif |
| `AIBanner` | Server | Carte bleue avec ✨ + phrase IA (ou fallback "Pas de commentaire disponible") |
| `LevelHero` | Server | Bloc d'en-tête de la page Now : gros niveau actuel + date/heure de la dernière mesure (alignés) |
| `KpiGrid` | Server | Grille 2×2 des deltas (Tendance 7 j, VS hier, VS 3 j, VS sem.) — pas de "niveau actuel" ni "dernier relevé" (ils sont dans `<LevelHero>`) |
| `DaysSelector` | Client | Chips tactiles `3 j · 7 j · 30 j · 90 j · 365 j` |
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
| 3 jours | 1 h | 0.030 | ~72 |
| 7 jours | 2 h | 0.025 | ~84 |
| 30 jours | 6 h | 0.015 | ~120 |
| 90 jours | 12 h | 0.010 | ~180 |
| 365 jours | 24 h | 0.010 | ~365 |

---

## Le composant `WaterChart` (graph générique)

Utilisé par `/annuel` (les 2 graphs). Wrapper autour de `echarts-for-react`. Gère :

1. **Lignes multiples** (légende activée si > 1 ligne)
2. **Gradient sous la courbe** quand il n'y a qu'une seule ligne
3. **Seuils horizontaux** via `markLine` ECharts sur la 1ère série
4. **`dataZoom` inside** : pinch-zoom et pan natifs sur mobile
5. **`touch-action: none`** en CSS pour bloquer le pinch-zoom de la page

**Bug fix important** : `color` est mis à 3 endroits (top-level série + `itemStyle.color` + `lineStyle.color`) pour que le marker du tooltip ait bien la même couleur que la ligne (ECharts utilise `color` au top-level pour le marker, pas `lineStyle.color`).

---

## Routes API (9 routes)

Toutes en `export const dynamic = "force-dynamic"` pour empêcher Next.js de tenter de SSG-er du contenu DB-dépendant à build time.

### Lecture (publique, aucune auth)

```
GET /api/water/recent?days=N        → mesures détaillées (datetime + value) sur N jours
GET /api/water/yearly?years=2025,…  → 1 mesure/jour par année (la première du jour)
GET /api/water/full                 → 1 mesure/jour depuis 2021-07-07
GET /api/ai/commentary?kind=…       → dernière phrase IA (tendance | comparaison_annuelle)
GET /api/thresholds                 → liste des seuils actifs
GET /api/health                     → { status, last_measure_age_min, db_size_mb }
```

`/api/health` renvoie **HTTP 200** si la dernière mesure date de < 120 min, **HTTP 503** sinon.

### Mutations (admin seulement)

```
POST   /api/thresholds              → créer un seuil
PUT    /api/thresholds/:id          → modifier
DELETE /api/thresholds/:id          → soft delete
POST   /api/auth/login              → cookie de session signée
POST   /api/auth/logout             → vide le cookie
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
