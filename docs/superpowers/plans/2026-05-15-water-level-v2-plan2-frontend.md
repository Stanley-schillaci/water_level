# Plan 2 — Next.js Frontend (Lac des Saints Peyres V2)

> **For agentic workers:** Steps use checkbox (`- [ ]`) for tracking. Implement task-by-task.

**Goal:** Build a Next.js 15 PWA front + API routes that reads the SQLite DB populated by Plan 1's Python worker. 3 public views (Now / Annuel / Histo) + protected /admin page for managing thresholds. Mobile-first, iPhone PWA-installable.

**Architecture:** Next.js App Router (SSR + Route Handlers) with `better-sqlite3` reading the same `niveau_eau.db` file. Apache ECharts via `echarts-for-react` for touch-friendly charts. Tailwind CSS for styling. `iron-session` for admin cookies. `@serwist/next` for PWA.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 4, better-sqlite3, echarts + echarts-for-react, iron-session, @serwist/next, Vitest (light testing).

**Spec reference:** `docs/superpowers/specs/2026-05-15-water-level-v2-design.md` sections 3, 5, 6.

---

## File structure (target)

```
water_level/
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── .env.local.example
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   ├── icon-192.png       (placeholder droplet PNG)
│   │   ├── icon-512.png
│   │   └── apple-touch-icon.png
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # root layout, PWA meta, AppShell
│   │   │   ├── globals.css
│   │   │   ├── page.tsx          # / (Now)
│   │   │   ├── annuel/page.tsx
│   │   │   ├── histo/page.tsx
│   │   │   ├── admin/page.tsx
│   │   │   └── api/
│   │   │       ├── water/recent/route.ts
│   │   │       ├── water/yearly/route.ts
│   │   │       ├── water/full/route.ts
│   │   │       ├── ai/commentary/route.ts
│   │   │       ├── thresholds/route.ts
│   │   │       ├── thresholds/[id]/route.ts
│   │   │       ├── auth/login/route.ts
│   │   │       ├── auth/logout/route.ts
│   │   │       └── health/route.ts
│   │   ├── components/
│   │   │   ├── AppShell.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   ├── AIBanner.tsx
│   │   │   ├── KpiGrid.tsx
│   │   │   ├── DaysSelector.tsx
│   │   │   ├── YearSelector.tsx
│   │   │   ├── WaterChart.tsx
│   │   │   └── admin/
│   │   │       ├── LoginForm.tsx
│   │   │       └── ThresholdsList.tsx
│   │   └── lib/
│   │       ├── db.ts             # better-sqlite3 singleton + queries
│   │       ├── kpi.ts            # mirror of Python kpi.py
│   │       ├── session.ts        # iron-session config
│   │       └── auth.ts           # password check helper
│   └── tests/
│       ├── kpi.test.ts
│       └── db.test.ts
```

DB env var: `LAC_DB_PATH=../niveau_eau.db` (same file as Plan 1 worker).

---

## Conventions

- TypeScript strict mode.
- Each task = one commit.
- Tests only on the critical pure logic (kpi.ts + db queries). Skip Vitest for UI components (verify visually in dev server).
- Server Components by default. Use `"use client"` only on interactive components (chart, selectors, login form).
- DB is read-only from Next.js (writes only via admin routes for thresholds).
- Push at the end (Task 12).

---

## Task 1: Scaffold Next.js 15 + Tailwind + TypeScript

**Files:** `web/` directory tree.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/stanley.schillaci/Documents/stan/water_level
npx --yes create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --no-git
```

When prompted for additional questions, accept defaults (yes to App Router, no to customize default config).

- [ ] **Step 2: Verify dev server boots**

```bash
cd web && npm run dev
```

Open http://localhost:3000 in the browser → should see Next.js welcome page. Stop with Ctrl+C.

- [ ] **Step 3: Add core deps**

```bash
cd web && npm install better-sqlite3 echarts echarts-for-react iron-session zod
npm install --save-dev @types/better-sqlite3 vitest @vitejs/plugin-react @vitest/coverage-v8
```

- [ ] **Step 4: Update `.gitignore` at repo root**

Append:
```
# Next.js
web/.next/
web/node_modules/
web/.env.local
web/coverage/
```

- [ ] **Step 5: Commit**

```bash
cd /Users/stanley.schillaci/Documents/stan/water_level
git add web/ .gitignore
git commit -m "chore(web): scaffold Next.js 15 + Tailwind + TypeScript"
```

---

## Task 2: DB layer (`lib/db.ts`) + KPI mirror (`lib/kpi.ts`)

**Files:**
- Create: `web/src/lib/db.ts`
- Create: `web/src/lib/kpi.ts`
- Create: `web/.env.local.example`
- Create: `web/tests/kpi.test.ts`
- Create: `web/vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Create `.env.local.example`**

```bash
LAC_DB_PATH=../niveau_eau.db
ADMIN_PASSWORD=changeme
SESSION_PASSWORD=at-least-32-characters-long-random-string-here
```

- [ ] **Step 3: Create `lib/db.ts`**

```typescript
import Database from "better-sqlite3";
import path from "path";

let _db: Database.Database | null = null;

function dbPath(): string {
  const p = process.env.LAC_DB_PATH ?? "../niveau_eau.db";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath(), { readonly: false, fileMustExist: false });
  _db.pragma("journal_mode = WAL");
  return _db;
}

export type Measure = { datetime_event: string; value: number };
export type DailyMeasure = { date_event: string; value: number };
export type Threshold = {
  id: number;
  name: string;
  description: string;
  value: number;
  color: string;
  dash_style: string;
};

export function getRecentMeasures(days: number): Measure[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT datetime_event, value FROM water_level
       WHERE datetime_event >= datetime('now', ?)
       ORDER BY datetime_event ASC`
    )
    .all(`-${days} days`) as Measure[];
}

export function getFirstMeasurePerDayForYears(years: number[]): DailyMeasure[] {
  if (years.length === 0) return [];
  const db = getDb();
  const placeholders = years.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT w.date_event, w.value
       FROM water_level w
       JOIN (
         SELECT date_event, MIN(datetime_event) AS min_dt
         FROM water_level
         WHERE CAST(strftime('%Y', date_event) AS INTEGER) IN (${placeholders})
         GROUP BY date_event
       ) sub ON w.date_event = sub.date_event AND w.datetime_event = sub.min_dt
       ORDER BY w.date_event ASC`
    )
    .all(...years) as DailyMeasure[];
}

export function getFullHistory(): DailyMeasure[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT w.date_event, w.value
       FROM water_level w
       JOIN (
         SELECT date_event, MIN(datetime_event) AS min_dt
         FROM water_level
         GROUP BY date_event
       ) sub ON w.date_event = sub.date_event AND w.datetime_event = sub.min_dt
       ORDER BY w.date_event ASC`
    )
    .all() as DailyMeasure[];
}

export function getAvailableYears(): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT CAST(strftime('%Y', date_event) AS INTEGER) AS y
       FROM water_level ORDER BY y ASC`
    )
    .all() as Array<{ y: number }>;
  return rows.map((r) => r.y);
}

export function getLastMeasure(): Measure | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT datetime_event, value FROM water_level
         ORDER BY datetime_event DESC LIMIT 1`
      )
      .get() as Measure | undefined) ?? null
  );
}

export function getThresholds(): Threshold[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, description, value, color, dash_style
       FROM threshold_line WHERE is_deleted = 0 ORDER BY value DESC`
    )
    .all() as Threshold[];
}

export function createThreshold(t: Omit<Threshold, "id">): number {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO threshold_line (name, description, value, color, dash_style)
       VALUES (@name, @description, @value, @color, @dash_style)`
    )
    .run(t);
  return Number(res.lastInsertRowid);
}

export function updateThreshold(id: number, t: Omit<Threshold, "id">): void {
  const db = getDb();
  db.prepare(
    `UPDATE threshold_line SET
       name = @name, description = @description, value = @value,
       color = @color, dash_style = @dash_style,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = @id`
  ).run({ ...t, id });
}

export function deleteThreshold(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE threshold_line SET is_deleted = 1,
       deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(id);
}

export function getLatestAICommentary(kind: "tendance" | "comparaison_annuelle"): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT response FROM gpt_logs
       WHERE type = ? ORDER BY created_at DESC, id DESC LIMIT 1`
    )
    .get(kind) as { response: string } | undefined;
  return row?.response ?? null;
}
```

- [ ] **Step 4: Create `lib/kpi.ts` (TypeScript mirror of Python kpi.py)**

```typescript
import type { Measure } from "./db";

export type Kpis = {
  lastDatetime: string | null;
  level: number | null;
  vsJ1: number | null;
  vsJ3: number | null;
  vsS1: number | null;
  trend7dMPerDay: number | null;
};

export type AnnualKpis = {
  vsY1: number | null;
  vsY2: number | null;
  vsY3: number | null;
};

function valueAtOrBefore(measures: Measure[], target: Date): number | null {
  let best: Measure | null = null;
  for (const m of measures) {
    if (new Date(m.datetime_event) <= target) {
      if (!best || m.datetime_event > best.datetime_event) best = m;
    }
  }
  return best ? best.value : null;
}

export function computeKpis(measures: Measure[]): Kpis {
  if (measures.length === 0) {
    return { lastDatetime: null, level: null, vsJ1: null, vsJ3: null, vsS1: null, trend7dMPerDay: null };
  }
  const last = measures[measures.length - 1];
  const lastDt = new Date(last.datetime_event);
  const level = last.value;

  const sub = (days: number) => new Date(lastDt.getTime() - days * 86400_000);
  const vJ1 = valueAtOrBefore(measures, sub(1));
  const vJ3 = valueAtOrBefore(measures, sub(3));
  const vS1 = valueAtOrBefore(measures, sub(7));

  return {
    lastDatetime: last.datetime_event,
    level,
    vsJ1: vJ1 !== null ? level - vJ1 : null,
    vsJ3: vJ3 !== null ? level - vJ3 : null,
    vsS1: vS1 !== null ? level - vS1 : null,
    trend7dMPerDay: vS1 !== null ? (level - vS1) / 7 : null,
  };
}

export function computeAnnualKpis(measures: Measure[]): AnnualKpis {
  if (measures.length === 0) return { vsY1: null, vsY2: null, vsY3: null };
  const last = measures[measures.length - 1];
  const lastDt = new Date(last.datetime_event);
  const level = last.value;

  const lookup = (yearsBack: number): number | null => {
    const target = new Date(lastDt.getTime() - yearsBack * 365 * 86400_000);
    const winStart = target.getTime() - 3 * 86400_000;
    const winEnd = target.getTime() + 3 * 86400_000;
    let closest: Measure | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const m of measures) {
      const t = new Date(m.datetime_event).getTime();
      if (t < winStart || t > winEnd) continue;
      const delta = Math.abs(t - target.getTime());
      if (delta < bestDelta) {
        bestDelta = delta;
        closest = m;
      }
    }
    return closest ? level - closest.value : null;
  };

  return { vsY1: lookup(1), vsY2: lookup(2), vsY3: lookup(3) };
}
```

- [ ] **Step 5: Create `tests/kpi.test.ts`**

```typescript
import { describe, expect, test } from "vitest";
import { computeAnnualKpis, computeKpis } from "../src/lib/kpi";

const dt = (d: Date) => d.toISOString().replace("T", " ").replace(/\..*/, "");

describe("computeKpis", () => {
  test("returns nulls when no measures", () => {
    const k = computeKpis([]);
    expect(k.level).toBeNull();
    expect(k.vsJ1).toBeNull();
  });

  test("computes deltas vs 1d / 3d / 7d", () => {
    const now = new Date();
    const back = (d: number) => new Date(now.getTime() - d * 86400_000);
    const m = [
      { datetime_event: dt(back(7)), value: 664.8 },
      { datetime_event: dt(back(3)), value: 665.1 },
      { datetime_event: dt(back(1)), value: 665.3 },
      { datetime_event: dt(now), value: 665.5 },
    ];
    const k = computeKpis(m);
    expect(k.level).toBe(665.5);
    expect(k.vsJ1).toBeCloseTo(0.2, 2);
    expect(k.vsJ3).toBeCloseTo(0.4, 2);
    expect(k.vsS1).toBeCloseTo(0.7, 2);
    expect(k.trend7dMPerDay).toBeCloseTo(0.1, 2);
  });
});

describe("computeAnnualKpis", () => {
  test("returns all nulls when no historical data", () => {
    const now = new Date();
    const m = [{ datetime_event: dt(now), value: 665.0 }];
    const a = computeAnnualKpis(m);
    expect(a).toEqual({ vsY1: null, vsY2: null, vsY3: null });
  });

  test("computes vsY1 when there's a measure ~1 year back", () => {
    const now = new Date();
    const yearAgo = new Date(now.getTime() - 365 * 86400_000);
    const m = [
      { datetime_event: dt(yearAgo), value: 665.2 },
      { datetime_event: dt(now), value: 665.5 },
    ];
    const a = computeAnnualKpis(m);
    expect(a.vsY1).toBeCloseTo(0.3, 2);
  });
});
```

- [ ] **Step 6: Run tests + commit**

```bash
cd web && npx vitest run
```
Expected: 4 tests pass.

```bash
cd /Users/stanley.schillaci/Documents/stan/water_level
git add web/src/lib/ web/tests/ web/vitest.config.ts web/.env.local.example
git commit -m "feat(web): DB layer (better-sqlite3) + KPI helpers + vitest"
```

---

## Task 3: API routes — water + ai/commentary + health

**Files:**
- Create: `web/src/app/api/water/recent/route.ts`
- Create: `web/src/app/api/water/yearly/route.ts`
- Create: `web/src/app/api/water/full/route.ts`
- Create: `web/src/app/api/ai/commentary/route.ts`
- Create: `web/src/app/api/health/route.ts`

- [ ] **Step 1: Create `api/water/recent/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRecentMeasures } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysRaw = Number.parseInt(url.searchParams.get("days") ?? "7", 10);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 7;
  const measures = getRecentMeasures(days);
  return NextResponse.json({ days, count: measures.length, measures });
}
```

- [ ] **Step 2: Create `api/water/yearly/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getAvailableYears, getFirstMeasurePerDayForYears } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearsParam = url.searchParams.get("years");
  let years: number[];
  if (yearsParam) {
    years = yearsParam
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  } else {
    const available = getAvailableYears();
    years = available.slice(-4); // 4 most recent
  }
  const measures = getFirstMeasurePerDayForYears(years);
  return NextResponse.json({ years, count: measures.length, measures });
}
```

- [ ] **Step 3: Create `api/water/full/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getFullHistory } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const measures = getFullHistory();
  return NextResponse.json({ count: measures.length, measures });
}
```

- [ ] **Step 4: Create `api/ai/commentary/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getLatestAICommentary } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind") ?? "tendance";
  const kind = kindRaw === "comparaison_annuelle" ? "comparaison_annuelle" : "tendance";
  const text = getLatestAICommentary(kind);
  return NextResponse.json({ kind, text });
}
```

- [ ] **Step 5: Create `api/health/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getDb, getLastMeasure } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const last = getLastMeasure();
  const ageMin = last
    ? Math.floor((Date.now() - new Date(last.datetime_event).getTime()) / 60000)
    : null;
  const ok = ageMin !== null && ageMin <= 120;
  const dbSize = getDb().pragma("page_count * page_size", { simple: true });
  return NextResponse.json(
    {
      status: ok ? "ok" : "stale",
      last_measure_age_min: ageMin,
      db_size_mb: typeof dbSize === "number" ? Math.round(dbSize / 1024 / 1024) : null,
    },
    { status: ok ? 200 : 503 }
  );
}
```

- [ ] **Step 6: Smoke test in dev**

```bash
cd web && npm run dev
```

In another terminal:
```bash
curl http://localhost:3000/api/water/recent?days=3 | head -c 200
curl http://localhost:3000/api/ai/commentary | head
curl http://localhost:3000/api/health | head
```
Expected: JSON responses with data from the real DB.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/api/
git commit -m "feat(web): API routes (water/recent/yearly/full + ai/commentary + health)"
```

---

## Task 4: Layout shell + bottom nav + globals

**Files:**
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/globals.css`
- Create: `web/src/components/AppShell.tsx`
- Create: `web/src/components/BottomNav.tsx`

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@layer base {
  html {
    -webkit-tap-highlight-color: transparent;
  }
  body {
    @apply bg-slate-50 text-slate-900 antialiased;
    @apply min-h-screen;
    /* Respect iOS safe areas */
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  @media (prefers-color-scheme: dark) {
    body {
      @apply bg-slate-950 text-slate-100;
    }
  }
}
```

- [ ] **Step 2: Replace `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lac des Saints Peyres",
  description: "Niveau d'eau du barrage du lac des Saints Peyres",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Saints Peyres",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `components/AppShell.tsx`**

```tsx
import BottomNav from "./BottomNav";
import { getLastMeasure } from "@/lib/db";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const last = getLastMeasure();
  const ageMin = last
    ? Math.floor((Date.now() - new Date(last.datetime_event).getTime()) / 60000)
    : null;
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 pt-4 pb-2 sticky top-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur z-10">
        <h1 className="text-lg font-bold tracking-tight">💧 Saints Peyres</h1>
        {ageMin !== null && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mis à jour il y a {ageMin < 60 ? `${ageMin} min` : `${Math.floor(ageMin / 60)} h`}
          </p>
        )}
      </header>
      <main className="flex-1 px-4 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Create `components/BottomNav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: "💧", label: "Now" },
  { href: "/annuel", icon: "📈", label: "Annuel" },
  { href: "/histo", icon: "📊", label: "Histo" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 pt-2 pb-[env(safe-area-inset-bottom,8px)] flex"
    >
      {items.map((it) => {
        const active = path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex-1 flex flex-col items-center text-[11px] py-1 ${
              active
                ? "text-blue-600 dark:text-blue-400 font-semibold"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <span className="text-xl">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/app/layout.tsx web/src/app/globals.css web/src/components/
git commit -m "feat(web): layout shell + bottom nav + safe-area iOS support"
```

---

## Task 5: Vue Now — KPI grid + AI banner + days selector + chart

**Files:**
- Replace: `web/src/app/page.tsx`
- Create: `web/src/components/AIBanner.tsx`
- Create: `web/src/components/KpiGrid.tsx`
- Create: `web/src/components/DaysSelector.tsx`
- Create: `web/src/components/WaterChart.tsx`

- [ ] **Step 1: Create `components/AIBanner.tsx`**

```tsx
type Props = { text: string | null };

export default function AIBanner({ text }: Props) {
  if (!text) {
    return (
      <div className="rounded-lg bg-slate-100 dark:bg-slate-900 px-4 py-3 mb-4 text-sm text-slate-500">
        Pas de commentaire IA disponible.
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 px-4 py-3 mb-4 text-sm">
      <span className="mr-1">✨</span>
      {text}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/KpiGrid.tsx`**

```tsx
import type { Kpis } from "@/lib/kpi";

function Cell({ label, value, signed = false, unit = "" }: {
  label: string;
  value: number | string | null;
  signed?: boolean;
  unit?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-lg font-bold mt-1">—</div>
      </div>
    );
  }
  let display: string;
  let color = "";
  if (typeof value === "number") {
    if (signed) {
      display = `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
      color = value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "";
    } else {
      display = value.toFixed(2);
    }
  } else {
    display = value;
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color}`}>{display}{unit && <span className="text-xs ml-0.5">{unit}</span>}</div>
    </div>
  );
}

export default function KpiGrid({ kpis }: { kpis: Kpis }) {
  const lastDate = kpis.lastDatetime
    ? new Date(kpis.lastDatetime).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
  return (
    <div className="space-y-2 mb-4">
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Dernier relevé" value={lastDate} />
        <Cell label="Niveau" value={kpis.level} unit="m" />
        <Cell label="Tendance 7j" value={kpis.trend7dMPerDay} signed unit="m/j" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="VS hier" value={kpis.vsJ1} signed unit="m" />
        <Cell label="VS 3j" value={kpis.vsJ3} signed unit="m" />
        <Cell label="VS sem." value={kpis.vsS1} signed unit="m" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/DaysSelector.tsx`**

```tsx
"use client";

const OPTIONS = [3, 7, 30, 90, 365];

export default function DaysSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1 mb-3 overflow-x-auto -mx-1 px-1">
      {OPTIONS.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${
            value === n
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
          }`}
        >
          {n}j
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/WaterChart.tsx`**

```tsx
"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

export type ChartPoint = { x: string; y: number };
export type ChartLine = { name: string; data: ChartPoint[]; color?: string };
export type ChartThreshold = { name: string; value: number; color: string; dashStyle?: string };

type Props = {
  lines: ChartLine[];
  thresholds?: ChartThreshold[];
  yLabel?: string;
  xAxisType?: "time" | "category";
  height?: number;
};

const ACCENT = "#2563eb";

export default function WaterChart({
  lines,
  thresholds = [],
  yLabel = "Niveau (m)",
  xAxisType = "time",
  height = 280,
}: Props) {
  const option = useMemo(() => {
    const series = lines.map((l, i) => ({
      name: l.name,
      type: "line" as const,
      data: l.data.map((p) => [p.x, p.y]),
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { color: l.color ?? (i === 0 ? ACCENT : undefined), width: 2 },
      areaStyle: lines.length === 1
        ? {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${l.color ?? ACCENT}55` },
                { offset: 1, color: `${l.color ?? ACCENT}00` },
              ],
            },
          }
        : undefined,
      markLine:
        thresholds.length > 0
          ? {
              symbol: "none",
              silent: true,
              lineStyle: { type: "dashed" as const },
              data: thresholds.map((t) => ({
                yAxis: t.value,
                lineStyle: { color: t.color, type: (t.dashStyle as "solid" | "dashed" | "dotted") ?? "dashed" },
                label: { formatter: t.name, color: t.color, position: "insideEndTop" as const, fontSize: 10 },
              })),
            }
          : undefined,
    }));
    return {
      grid: { left: 40, right: 12, top: 16, bottom: 24 },
      tooltip: { trigger: "axis", confine: true },
      xAxis: {
        type: xAxisType,
        axisLabel: { fontSize: 10 },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        name: yLabel,
        nameTextStyle: { fontSize: 10 },
        scale: true,
        axisLabel: { fontSize: 10 },
      },
      legend: lines.length > 1 ? { bottom: 0, type: "scroll" as const, itemHeight: 8 } : undefined,
      dataZoom: [{ type: "inside" as const }],
      series,
    };
  }, [lines, thresholds, xAxisType, yLabel]);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-2"
      style={{ touchAction: "none" }}
    >
      <ReactECharts option={option} style={{ height, width: "100%" }} notMerge={true} />
    </div>
  );
}
```

- [ ] **Step 5: Replace `app/page.tsx`**

```tsx
import AIBanner from "@/components/AIBanner";
import KpiGrid from "@/components/KpiGrid";
import DaysSelectorWithChart from "./_DaysSelectorWithChart";
import { getLatestAICommentary, getRecentMeasures, getThresholds } from "@/lib/db";
import { computeKpis } from "@/lib/kpi";

export const dynamic = "force-dynamic";

export default async function NowPage() {
  const measures7d = getRecentMeasures(7);
  const kpis = computeKpis(measures7d);
  const banner = getLatestAICommentary("tendance");
  const thresholds = getThresholds();

  return (
    <div>
      <AIBanner text={banner} />
      <KpiGrid kpis={kpis} />
      <DaysSelectorWithChart
        thresholds={thresholds.map((t) => ({
          name: t.name,
          value: t.value,
          color: t.color,
          dashStyle: t.dash_style === "dash" ? "dashed" : t.dash_style === "dot" ? "dotted" : "solid",
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 6: Create `app/_DaysSelectorWithChart.tsx`**

```tsx
"use client";

import DaysSelector from "@/components/DaysSelector";
import WaterChart, { type ChartThreshold } from "@/components/WaterChart";
import { useEffect, useState } from "react";

type Measure = { datetime_event: string; value: number };

export default function DaysSelectorWithChart({ thresholds }: { thresholds: ChartThreshold[] }) {
  const [days, setDays] = useState<number>(() => {
    if (typeof window === "undefined") return 7;
    const stored = window.localStorage.getItem("lac-days");
    return stored ? Number.parseInt(stored, 10) || 7 : 7;
  });
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/water/recent?days=${days}`)
      .then((r) => r.json())
      .then((d) => setMeasures(d.measures ?? []))
      .finally(() => setLoading(false));
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lac-days", String(days));
    }
  }, [days]);

  return (
    <>
      <DaysSelector value={days} onChange={setDays} />
      <WaterChart
        lines={[
          {
            name: "Niveau",
            data: measures.map((m) => ({ x: m.datetime_event, y: m.value })),
          },
        ]}
        thresholds={thresholds}
        height={300}
      />
      {loading && <p className="text-xs text-slate-500 mt-2">Chargement...</p>}
    </>
  );
}
```

- [ ] **Step 7: Smoke test**

```bash
cd web && npm run dev
```
Open http://localhost:3000 → should see: AI banner (if data), KPI grid with current values, days selector + chart. Try clicking different day options.

- [ ] **Step 8: Commit**

```bash
git add web/src/app/page.tsx web/src/app/_DaysSelectorWithChart.tsx web/src/components/
git commit -m "feat(web): Now view (AI banner + KPI grid + days selector + chart)"
```

---

## Task 6: Vue Annuel — year selector + overlay chart

**Files:**
- Create: `web/src/app/annuel/page.tsx`
- Create: `web/src/app/annuel/_AnnualChart.tsx`
- Create: `web/src/components/YearSelector.tsx`

- [ ] **Step 1: Create `components/YearSelector.tsx`**

```tsx
"use client";

export default function YearSelector({
  available,
  selected,
  onChange,
}: {
  available: number[];
  selected: number[];
  onChange: (years: number[]) => void;
}) {
  const toggle = (y: number) => {
    onChange(selected.includes(y) ? selected.filter((x) => x !== y) : [...selected, y].sort());
  };
  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {available.map((y) => {
        const active = selected.includes(y);
        return (
          <button
            key={y}
            onClick={() => toggle(y)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              active
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
            }`}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/annuel/page.tsx`**

```tsx
import AIBanner from "@/components/AIBanner";
import AnnualChart from "./_AnnualChart";
import {
  getAvailableYears,
  getLatestAICommentary,
  getRecentMeasures,
  getThresholds,
} from "@/lib/db";
import { computeAnnualKpis } from "@/lib/kpi";

export const dynamic = "force-dynamic";

function Delta({ label, v }: { label: string; v: number | null }) {
  const display =
    v === null
      ? "—"
      : `${v >= 0 ? "+" : ""}${v.toFixed(2)} m`;
  const color = v === null ? "" : v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "";
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color}`}>{display}</div>
    </div>
  );
}

export default function AnnualPage() {
  const banner = getLatestAICommentary("comparaison_annuelle");
  const available = getAvailableYears();
  // Compute annual KPIs from a wide window (last 4 years of data)
  const longMeasures = getRecentMeasures(365 * 4);
  const annual = computeAnnualKpis(longMeasures);
  const currentYear = new Date().getFullYear();
  const thresholds = getThresholds();

  return (
    <div>
      <AIBanner text={banner} />
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Delta label={`VS ${currentYear - 1}`} v={annual.vsY1} />
        <Delta label={`VS ${currentYear - 2}`} v={annual.vsY2} />
        <Delta label={`VS ${currentYear - 3}`} v={annual.vsY3} />
      </div>
      <AnnualChart
        availableYears={available}
        thresholds={thresholds.map((t) => ({
          name: t.name,
          value: t.value,
          color: t.color,
          dashStyle: t.dash_style === "dash" ? "dashed" : t.dash_style === "dot" ? "dotted" : "solid",
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `app/annuel/_AnnualChart.tsx`**

```tsx
"use client";

import WaterChart, { type ChartThreshold } from "@/components/WaterChart";
import YearSelector from "@/components/YearSelector";
import { useEffect, useState } from "react";

type DailyMeasure = { date_event: string; value: number };

const YEAR_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#9333ea", "#0891b2", "#ea580c"];

export default function AnnualChart({
  availableYears,
  thresholds,
}: {
  availableYears: number[];
  thresholds: ChartThreshold[];
}) {
  const defaultYears = availableYears.slice(-4);
  const [selected, setSelected] = useState<number[]>(defaultYears);
  const [data, setData] = useState<DailyMeasure[]>([]);

  useEffect(() => {
    fetch(`/api/water/yearly?years=${selected.join(",")}`)
      .then((r) => r.json())
      .then((d) => setData(d.measures ?? []));
  }, [selected]);

  // Group by year, normalize date to month-day so years overlay
  const byYear = new Map<number, { x: string; y: number }[]>();
  for (const m of data) {
    const year = Number.parseInt(m.date_event.slice(0, 4), 10);
    const mmdd = m.date_event.slice(5);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push({ x: `2000-${mmdd}`, y: m.value });
  }
  const lines = selected.map((y, i) => ({
    name: String(y),
    color: YEAR_COLORS[i % YEAR_COLORS.length],
    data: byYear.get(y) ?? [],
  }));

  return (
    <>
      <YearSelector available={availableYears} selected={selected} onChange={setSelected} />
      <WaterChart lines={lines} thresholds={thresholds} height={320} xAxisType="time" />
    </>
  );
}
```

- [ ] **Step 4: Smoke test + commit**

```bash
npm run dev # if not running
# Open http://localhost:3000/annuel
```

```bash
git add web/src/app/annuel/ web/src/components/YearSelector.tsx
git commit -m "feat(web): Annuel view (year selector + overlay chart)"
```

---

## Task 7: Vue Histo — full history chart

**Files:**
- Create: `web/src/app/histo/page.tsx`
- Create: `web/src/app/histo/_HistoChart.tsx`

- [ ] **Step 1: Create `app/histo/page.tsx`**

```tsx
import HistoChart from "./_HistoChart";
import { getThresholds } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function HistoPage() {
  const thresholds = getThresholds();
  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Évolution depuis le 7 juillet 2021</h2>
      <HistoChart
        thresholds={thresholds.map((t) => ({
          name: t.name,
          value: t.value,
          color: t.color,
          dashStyle: t.dash_style === "dash" ? "dashed" : t.dash_style === "dot" ? "dotted" : "solid",
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `app/histo/_HistoChart.tsx`**

```tsx
"use client";

import WaterChart, { type ChartThreshold } from "@/components/WaterChart";
import { useEffect, useState } from "react";

type DailyMeasure = { date_event: string; value: number };

export default function HistoChart({ thresholds }: { thresholds: ChartThreshold[] }) {
  const [data, setData] = useState<DailyMeasure[]>([]);

  useEffect(() => {
    fetch(`/api/water/full`)
      .then((r) => r.json())
      .then((d) => setData(d.measures ?? []));
  }, []);

  return (
    <WaterChart
      lines={[
        {
          name: "Niveau",
          data: data.map((m) => ({ x: m.date_event, y: m.value })),
        },
      ]}
      thresholds={thresholds}
      height={340}
    />
  );
}
```

- [ ] **Step 3: Smoke test + commit**

```bash
# Open http://localhost:3000/histo
```

```bash
git add web/src/app/histo/
git commit -m "feat(web): Histo view (full history chart with dataZoom)"
```

---

## Task 8: Auth (session + login form + admin page CRUD)

**Files:**
- Create: `web/src/lib/session.ts`
- Create: `web/src/lib/auth.ts`
- Create: `web/src/app/api/auth/login/route.ts`
- Create: `web/src/app/api/auth/logout/route.ts`
- Create: `web/src/app/api/thresholds/route.ts`
- Create: `web/src/app/api/thresholds/[id]/route.ts`
- Create: `web/src/app/admin/page.tsx`
- Create: `web/src/app/admin/_AdminClient.tsx`

- [ ] **Step 1: Create `lib/session.ts`**

```typescript
import type { SessionOptions } from "iron-session";

export type SessionData = { isAdmin?: boolean };

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD ?? "fallback-only-for-dev-do-not-use-in-prod-32chars",
  cookieName: "lac-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
  },
};
```

- [ ] **Step 2: Create `lib/auth.ts`**

```typescript
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { type SessionData, sessionOptions } from "./session";

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function requireAdmin(): Promise<{ ok: true } | { ok: false; status: number }> {
  const s = await getSession();
  if (!s.isAdmin) return { ok: false, status: 401 };
  return { ok: true };
}
```

- [ ] **Step 3: Create `api/auth/login/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || password !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const s = await getSession();
  s.isAdmin = true;
  await s.save();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create `api/auth/logout/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST() {
  const s = await getSession();
  s.destroy();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create `api/thresholds/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createThreshold, getThresholds } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  value: z.number().min(600).max(700),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dash_style: z.enum(["solid", "dash", "dot", "dashdot", "longdash"]),
});

export async function GET() {
  return NextResponse.json({ thresholds: getThresholds() });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  const id = createThreshold(parsed.data);
  return NextResponse.json({ ok: true, id });
}
```

- [ ] **Step 6: Create `api/thresholds/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteThreshold, updateThreshold } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  value: z.number().min(600).max(700),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dash_style: z.enum(["solid", "dash", "dot", "dashdot", "longdash"]),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const { id } = await ctx.params;
  const idNum = Number.parseInt(id, 10);
  if (!Number.isFinite(idNum)) return NextResponse.json({ ok: false }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  updateThreshold(idNum, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const { id } = await ctx.params;
  const idNum = Number.parseInt(id, 10);
  if (!Number.isFinite(idNum)) return NextResponse.json({ ok: false }, { status: 400 });
  deleteThreshold(idNum);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Create `app/admin/page.tsx`**

```tsx
import { getSession } from "@/lib/auth";
import { getThresholds } from "@/lib/db";
import AdminClient from "./_AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session.isAdmin) {
    return <AdminClient initialThresholds={[]} authed={false} />;
  }
  return <AdminClient initialThresholds={getThresholds()} authed={true} />;
}
```

- [ ] **Step 8: Create `app/admin/_AdminClient.tsx`**

```tsx
"use client";

import { useState } from "react";

type Threshold = {
  id: number;
  name: string;
  description: string;
  value: number;
  color: string;
  dash_style: string;
};

const DASH_OPTIONS = [
  { value: "solid", label: "Solide" },
  { value: "dash", label: "Tiret" },
  { value: "dot", label: "Points" },
  { value: "dashdot", label: "Tiret-point" },
  { value: "longdash", label: "Tiret long" },
];

export default function AdminClient({
  initialThresholds,
  authed,
}: {
  initialThresholds: Threshold[];
  authed: boolean;
}) {
  const [isAuthed, setIsAuthed] = useState(authed);
  const [thresholds, setThresholds] = useState(initialThresholds);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      setIsAuthed(true);
      const data = await fetch("/api/thresholds").then((r) => r.json());
      setThresholds(data.thresholds);
      setPassword("");
    } else {
      setError("Mot de passe incorrect");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAuthed(false);
    setThresholds([]);
  }

  async function refresh() {
    const data = await fetch("/api/thresholds").then((r) => r.json());
    setThresholds(data.thresholds);
  }

  if (!isAuthed) {
    return (
      <form onSubmit={login} className="max-w-sm mt-10 mx-auto space-y-3">
        <h2 className="text-base font-semibold">🔐 Admin</h2>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          autoFocus
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white px-3 py-2 rounded font-semibold"
        >
          Se connecter
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold">⚙️ Seuils</h2>
        <button onClick={logout} className="text-xs text-slate-500 underline">
          Déconnexion
        </button>
      </div>
      <ThresholdForm onSaved={refresh} />
      <div className="space-y-2">
        {thresholds.map((t) => (
          <ThresholdItem key={t.id} t={t} onChanged={refresh} />
        ))}
        {thresholds.length === 0 && (
          <p className="text-sm text-slate-500">Aucun seuil défini.</p>
        )}
      </div>
    </div>
  );
}

function ThresholdForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState(665);
  const [color, setColor] = useState("#2563eb");
  const [dashStyle, setDashStyle] = useState("dash");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, value, color, dash_style: dashStyle }),
    });
    if (r.ok) {
      setOpen(false);
      setName("");
      setDescription("");
      onSaved();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full text-sm bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded p-3">
        + Ajouter un seuil
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 space-y-2">
      <input className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
      <textarea className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      <div className="flex gap-2 items-center text-sm">
        <input type="number" step="0.01" min={630} max={680} value={value} onChange={(e) => setValue(Number.parseFloat(e.target.value))} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent w-24" />
        <span className="text-xs text-slate-500">m</span>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-8 rounded" />
        <select value={dashStyle} onChange={(e) => setDashStyle(e.target.value)} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm flex-1">
          {DASH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-semibold">Enregistrer</button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm">Annuler</button>
      </div>
    </form>
  );
}

function ThresholdItem({ t, onChanged }: { t: Threshold; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description);
  const [value, setValue] = useState(t.value);
  const [color, setColor] = useState(t.color);
  const [dashStyle, setDashStyle] = useState(t.dash_style);

  async function save() {
    await fetch(`/api/thresholds/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, value, color, dash_style: dashStyle }),
    });
    setEdit(false);
    onChanged();
  }
  async function del() {
    if (!confirm(`Supprimer "${t.name}" ?`)) return;
    await fetch(`/api/thresholds/${t.id}`, { method: "DELETE" });
    onChanged();
  }

  if (!edit) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: t.color }} />
            <span className="font-medium text-sm">{t.name}</span>
            <span className="text-xs text-slate-500">{t.value.toFixed(2)} m</span>
          </div>
          {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setEdit(true)} className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">Modifier</button>
          <button onClick={del} className="text-xs px-2 py-1 rounded bg-red-50 dark:bg-red-950 text-red-600">Suppr.</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 space-y-2">
      <input className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      <div className="flex gap-2 items-center text-sm">
        <input type="number" step="0.01" min={630} max={680} value={value} onChange={(e) => setValue(Number.parseFloat(e.target.value))} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent w-24" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-8 rounded" />
        <select value={dashStyle} onChange={(e) => setDashStyle(e.target.value)} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm flex-1">
          {DASH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-semibold">Sauver</button>
        <button onClick={() => setEdit(false)} className="px-3 py-1.5 text-sm">Annuler</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Smoke test**

Set `ADMIN_PASSWORD=test123` and `SESSION_PASSWORD=an-arbitrary-long-random-string-32chars-min` in `web/.env.local`. Then:
```bash
npm run dev
# Open http://localhost:3000/admin
# Try wrong password → error
# Login with test123 → see threshold CRUD
# Add a threshold, edit, delete
```

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/session.ts web/src/lib/auth.ts web/src/app/api/auth/ web/src/app/api/thresholds/ web/src/app/admin/
git commit -m "feat(web): admin auth (iron-session) + thresholds CRUD"
```

---

## Task 9: PWA (manifest + icons + serwist)

**Files:**
- Create: `web/public/manifest.webmanifest`
- Create: `web/public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (placeholders)
- Modify: `web/next.config.ts`

- [ ] **Step 1: Create simple droplet PNG icons**

Use `npx`:
```bash
cd web
# Create a simple blue droplet using ImageMagick if available, otherwise download a placeholder
mkdir -p public

# Generate a simple solid-color square PNG with text "💧" — fallback if no imagemagick:
# Easiest: use a CDN icon. We'll use a base64 1x1 placeholder for now;
# the user can replace later. But: better to use a real droplet.
# If `convert` (ImageMagick) is available:
if command -v convert >/dev/null 2>&1; then
  convert -size 512x512 xc:'#2563eb' -fill white -gravity center -pointsize 280 -annotate +0+0 '💧' public/icon-512.png
  convert public/icon-512.png -resize 192x192 public/icon-192.png
  convert public/icon-512.png -resize 180x180 public/apple-touch-icon.png
else
  echo "WARN: ImageMagick not installed — icons will be 1x1 transparent placeholders. Run task 9 manually with a real PNG."
  # 1x1 transparent PNG (base64)
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" | base64 --decode > public/icon-192.png
  cp public/icon-192.png public/icon-512.png
  cp public/icon-192.png public/apple-touch-icon.png
fi
```

- [ ] **Step 2: Create `public/manifest.webmanifest`**

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

- [ ] **Step 3: Skip `@serwist/next` (overkill for a read-only site, manifest is enough for iOS install)**

iOS supports "Add to Home Screen" with just the manifest and apple-touch-icon. A service worker is only needed for offline support, which we don't need (data comes from the server every visit). Note in the README that the install prompt is iOS-Safari → Share button → "Sur l'écran d'accueil".

- [ ] **Step 4: Smoke test**

```bash
npm run dev
# On iPhone (same Wi-Fi), open http://<mac-ip>:3000
# Safari → Share → Add to Home Screen → app icon appears.
```

If you can't test on iPhone right now, just verify the manifest is served:
```bash
curl http://localhost:3000/manifest.webmanifest
```

- [ ] **Step 5: Commit**

```bash
git add web/public/
git commit -m "feat(web): PWA manifest + iOS-installable icons"
```

---

## Task 10: Smoke run + final commit + push

- [ ] **Step 1: Run all tests one more time**

```bash
cd web && npx vitest run
```
Expected: 4 tests pass.

- [ ] **Step 2: Build (production check)**

```bash
npm run build
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Try production mode locally**

```bash
npm start
# Open http://localhost:3000 and click through Now / Annuel / Histo / Admin
```

- [ ] **Step 4: Push v2**

```bash
git push origin v2
```

---

## Done — what you have at the end of Plan 2

A working Next.js PWA that:
- Serves 3 public mobile-first views (Now / Annuel / Histo) from the SQLite DB written by Plan 1.
- Renders touch-friendly ECharts (pinch-zoom, pan, dataZoom inside) optimized for iPhone.
- Has a `/admin` page protected by simple password + iron-session for CRUD on threshold lines.
- Is installable as a PWA on iPhone Pro Max via Safari "Add to Home Screen".
- Mode dark/light auto via `prefers-color-scheme`.
- Bottom-nav style native app.

Runs locally via `cd web && npm run dev`. Production build verified with `npm run build`.

**Next:** Plan 3 (OVH provisioning + Caddy + systemd + cutover from Streamlit Cloud).
