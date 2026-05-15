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
│   │   ├── layout.tsx            ← root layout + AppShell
│   │   ├── globals.css
│   │   ├── page.tsx              ← /         (Now)
│   │   ├── _DaysSelectorWithChart.tsx
│   │   ├── annuel/
│   │   │   ├── page.tsx          ← /annuel
│   │   │   └── _AnnualChart.tsx
│   │   ├── histo/
│   │   │   ├── page.tsx          ← /histo
│   │   │   └── _HistoChart.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx          ← /admin   (protégé)
│   │   │   └── _AdminClient.tsx
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
│   ├── components/               ← 8 composants UI partagés
│   │   ├── AppShell.tsx
│   │   ├── BottomNav.tsx
│   │   ├── AIBanner.tsx
│   │   ├── KpiGrid.tsx
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
- Les **Client Components** (charts, selecteurs interactifs) doivent passer par les routes API pour parler à la DB

Convention de nommage utilisée : les composants client commencent par `_` (ex: `_DaysSelectorWithChart.tsx`) — c'est juste une convention pour signaler "ce fichier porte le `"use client"`".

---

## Les 4 pages

### `/` (Now) — `src/app/page.tsx`

**Server Component** qui :
1. Appelle `getRecentMeasures(7)` côté serveur (rapide, lit directement la DB)
2. Calcule les KPIs avec `computeKpis()`
3. Récupère la phrase IA `getLatestAICommentary('tendance')`
4. Récupère les seuils `getThresholds()`
5. Rend : `<AIBanner>` + `<KpiGrid>` + `<DaysSelectorWithChart>`

`DaysSelectorWithChart` est **Client** (interactif) : il garde le N jours sélectionné en `useState` + `localStorage`, fait `fetch('/api/water/recent?days=N')` quand N change.

### `/annuel` — `src/app/annuel/page.tsx`

Comparaison superposée des années. Server Component :
- Récupère les KPIs annuels (`computeAnnualKpis`)
- Récupère la phrase IA "comparaison_annuelle"
- Délègue le graph au composant client `_AnnualChart`

`_AnnualChart` côté client gère la sélection des années (multi-select chips) et fait `fetch('/api/water/yearly?years=2025,2024,2023')`.

**Trick technique** : pour superposer plusieurs années sur le même axe X, on **normalise les dates** à l'année 2000 :
```typescript
const mmdd = m.date_event.slice(5);     // '03-15' depuis '2025-03-15'
return { x: `2000-${mmdd}`, y: m.value };
```
Toutes les années deviennent comparables visuellement sur ECharts.

### `/histo` — `src/app/histo/page.tsx`

Vue de l'évolution complète depuis 2021-07-07. Client component fetch `/api/water/full` (toutes les mesures journalières), affichées sur un seul graph avec `dataZoom` ECharts pour explorer une période.

### `/admin` — `src/app/admin/page.tsx`

**Protégée par mot de passe**. Server Component :
1. Lit la session via `getSession()` (cookie iron-session chiffré)
2. Si `session.isAdmin === true` : rend `<AdminClient initialThresholds={...} authed={true} />`
3. Sinon : rend `<AdminClient initialThresholds={[]} authed={false} />` (qui affiche le formulaire de login)

`_AdminClient` (client) gère :
- Le formulaire de login → `POST /api/auth/login` → cookie HttpOnly
- La liste des seuils + boutons modifier/supprimer
- Le formulaire d'ajout de seuil

---

## Les composants UI partagés

| Composant | Type | Rôle |
|---|---|---|
| `AppShell` | Server | Header sticky "💧 Saints Peyres" + indicateur "Mis à jour il y a N min" + bottom nav |
| `BottomNav` | Client | Barre nav iOS-style fixe en bas, 3 onglets (Now / Annuel / Histo) + état actif |
| `AIBanner` | Server | Carte bleue avec ✨ + phrase IA (ou fallback "Pas de commentaire disponible") |
| `KpiGrid` | Server | Grille 3×2 des KPIs (niveau, deltas, tendance) avec couleurs +/− |
| `DaysSelector` | Client | Chips tactiles `3j · 7j · 30j · 90j · 365j` (taille tactile 44px Apple) |
| `YearSelector` | Client | Chips d'années toggleables (multi-select) |
| `WaterChart` | Client | Wrapper ECharts + thresholds overlay + touch gestures |

---

## Le composant `WaterChart` (le cœur visuel)

Wrapper autour de `echarts-for-react`. Gère :

1. **Lignes multiples** (1 pour Now/Histo, N pour Annuel)
2. **Gradient sous la courbe** quand il n'y a qu'une seule ligne
3. **Seuils horizontaux** via `markLine` ECharts
4. **`dataZoom` inside** : pinch-zoom et pan natifs sur mobile
5. **`touch-action: none`** en CSS pour bloquer le pinch-zoom de la page (sinon conflit avec les gestures du graph)

Props :
```typescript
type Props = {
  lines: ChartLine[];          // [{ name, data: [{x, y}], color? }]
  thresholds?: ChartThreshold[];
  yLabel?: string;
  xAxisType?: "time" | "category";
  height?: number;
};
```

**Pourquoi ECharts plutôt que Plotly (V1) ?** Sur iPhone, Plotly intercepte mal les tap → souvent on zoom au lieu de scroller. ECharts a un `dataZoom: [{ type: "inside" }]` qui rend les gestures naturels (pinch = zoom du graph, scroll = scroll de la page).

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

`/api/health` renvoie **HTTP 200** si la dernière mesure date de < 120 min, **HTTP 503** sinon. Utilisé par UptimeRobot pour alerting.

### Mutations (admin seulement)

```
POST   /api/thresholds              → créer un seuil
PUT    /api/thresholds/:id          → modifier
DELETE /api/thresholds/:id          → soft delete
POST   /api/auth/login              → cookie de session signée
POST   /api/auth/logout             → vide le cookie
```

**Validation des bodies** : Zod, ex pour `/api/thresholds` :
```typescript
const Body = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  value: z.number().min(600).max(700),     // safety : niveau plausible
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dash_style: z.enum(["solid", "dash", "dot", "dashdot", "longdash"]),
});
```

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

**Important** : `better-sqlite3` est synchrone (pas d'async/await pour les queries DB). Plus rapide qu'un driver async pour SQLite local.

**Queries exposées** :
- `getRecentMeasures(days)` — pour la page Now et `/api/water/recent`
- `getFirstMeasurePerDayForYears(years[])` — pour `/api/water/yearly`
- `getFullHistory()` — pour `/api/water/full`
- `getAvailableYears()` — années dispos dans la DB
- `getLastMeasure()` — dernière ligne (pour le header "Mis à jour il y a…")
- `getThresholds()` — seuils actifs (non soft-deletés)
- `createThreshold(t)`, `updateThreshold(id, t)`, `deleteThreshold(id)` — CRUD admin
- `getLatestAICommentary(kind)` — dernière entrée gpt_logs du type donné

---

## KPI Layer (`src/lib/kpi.ts`)

**Mirror TypeScript** de `worker/src/lac_worker/kpi.py`. Calcule les mêmes KPIs côté front (pour pouvoir rafraîchir en live sans appeler le worker Python).

Fonctions :
- `computeKpis(measures: Measure[]): Kpis` — niveau, deltas vs hier/3j/7j, tendance
- `computeAnnualKpis(measures: Measure[]): AnnualKpis` — vs Y-1, Y-2, Y-3

**Pourquoi dupliquer en Python ET TypeScript ?**
- Python : pour générer la phrase IA (1× / jour, batch)
- TypeScript : pour afficher les KPIs en live à chaque requête HTTP

Garder les 2 implémentations séparées évite un appel inter-process à chaque page load.

---

## Auth (`src/lib/auth.ts` + `src/lib/session.ts`)

**Stateless** : pas de table `users`, pas de table `sessions` en DB.

```typescript
// session.ts
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD ?? "...fallback dev...",
  cookieName: "lac-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,   // 7 jours
  },
};

// auth.ts
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function requireAdmin() {
  const s = await getSession();
  if (!s.isAdmin) return { ok: false, status: 401 };
  return { ok: true };
}
```

**Comment ça marche** :
1. User envoie `POST /api/auth/login {password}`
2. Backend compare avec `process.env.ADMIN_PASSWORD`
3. Si OK : marque `session.isAdmin = true` et `session.save()` → cookie chiffré HttpOnly Secure SameSite=Strict
4. Toutes les routes mutations appellent `requireAdmin()` qui décrypte le cookie et vérifie le flag

**Pourquoi iron-session** : pas de DB, pas de Redis, juste un cookie auto-signé. Parfait pour 1-2 utilisateurs.

**Secrets requis** :
- `ADMIN_PASSWORD` — le mdp tapé sur `/admin` (actuellement `gothis1234`)
- `SESSION_PASSWORD` — clé de chiffrement du cookie (32+ chars hex, généré 1× avec `openssl rand -hex 32`)

---

## PWA (Progressive Web App)

L'app est **installable** sur l'écran d'accueil iPhone. Mécanisme :

### 1. `public/manifest.webmanifest`

```json
{
  "name": "Lac des Saints Peyres",
  "short_name": "Saints Peyres",
  "description": "Suivi du niveau d'eau du barrage du lac des Saints Peyres",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#2563eb",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 2. `<link rel="manifest">` dans `layout.tsx`

Géré via `metadata.manifest` dans Next.js Metadata API.

### 3. `apple-touch-icon.png` (180×180)

iOS Safari l'utilise pour l'icône sur l'écran d'accueil.

### 4. Meta tags

```typescript
appleWebApp: {
  capable: true,                  // mode standalone (pas de barre Safari)
  title: "Saints Peyres",         // titre sur l'écran d'accueil
  statusBarStyle: "default",
}
```

### Comment papa installe la PWA

1. Safari → ouvre `https://vps-9bc559d8.vps.ovh.net/`
2. Bouton **Partager** (carré avec flèche en haut)
3. Faire défiler → **"Sur l'écran d'accueil"**
4. Confirmer → icône droplet bleu apparaît sur l'écran d'accueil
5. Tap → ouvre l'app en plein écran (pas de barre Safari)

### Pourquoi pas de service worker ?

Un service worker permettrait de cacher l'app pour fonctionnement offline. **On n'en a pas besoin** : si l'app est offline, papa ne peut de toute façon pas avoir des données fraîches. Garder simple.

---

## Mode dark/light

**Automatique** via la media query `prefers-color-scheme` (suivie par les réglages iOS de papa : light le jour, dark le soir).

Implémentation Tailwind :
```css
/* globals.css */
@layer base {
  body {
    @apply bg-slate-50 text-slate-900;
  }
  @media (prefers-color-scheme: dark) {
    body {
      @apply bg-slate-950 text-slate-100;
    }
  }
}
```

Et dans les composants, classes Tailwind avec préfixe `dark:` :
```tsx
<div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
```

---

## Tests

**4 tests Vitest** dans `tests/kpi.test.ts`. On ne teste **que la logique pure** (compute KPIs). L'UI est testée visuellement (en dev sur le Mac, puis sur l'iPhone réel).

```bash
cd web
npx vitest run
```

Couvre :
- `computeKpis([])` → tout null
- `computeKpis(measures)` → deltas corrects vs J-1, J-3, J-7
- `computeAnnualKpis([])` → tout null
- `computeAnnualKpis(measures)` → delta vs Y-1 quand mesure il y a 1 an

**Pourquoi pas Playwright pour l'E2E ?** Volontairement non implémenté. Pour 4 pages d'usage perso, les tests visuels en dev + l'iPhone réel valent mieux qu'un E2E qui dort dans une CI.

---

## Build et déploiement

**Build local (dev)** :
```bash
cd web
npm run dev          # http://localhost:3000, hot reload
```

**Build prod (déploiement)** :
Le `make deploy VPS=lac` (depuis le Mac, dans le repo root) :
1. Rsync les sources vers le VPS (exclut `.next/`, `node_modules/`, `.env*`)
2. Sur le VPS : `npm ci` puis `LAC_DB_PATH=... npm run build`
3. Restart `lac-web.service`

**Pourquoi build sur le VPS** : `better-sqlite3` a des bindings natifs compilés pour Linux x86_64. Si on les compilait sur macOS, ils ne marcheraient pas sur le VPS.

---

## Variables d'environnement

`web/.env.local.example` (à copier en `.env.local` pour dev, en `.env.production` sur le VPS) :

```bash
LAC_DB_PATH=../niveau_eau.db                          # chemin vers la DB
ADMIN_PASSWORD=changeme                               # mdp page /admin
SESSION_PASSWORD=at-least-32-chars-long-random-here   # secret iron-session
```

Sur le VPS, ces vars sont chargées par systemd via `EnvironmentFile=/opt/lac/web/.env.production` dans le service unit.

---

## Pour aller plus loin

- Comment systemd déclenche tout ça : [05-infrastructure.md](05-infrastructure.md)
- Procédure de déploiement step-by-step : [06-operations.md](06-operations.md)
- Modèle de sécurité (auth, secrets, HTTPS) : [07-security.md](07-security.md)
