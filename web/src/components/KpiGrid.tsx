"use client";

import type { Kpis } from "@/lib/kpi";
import { formatDelta } from "@/lib/levelDisplay";

/**
 * Grille des KPIs "delta" :
 * - tendance 7 jours en m/j (auto cm/j si < 1m/j)
 * - delta vs hier, vs il y a 3j, vs sem. dernière (auto m↔cm via formatDelta)
 *
 * Le niveau actuel + dernier relevé sont affichés séparément par <LevelHero/>.
 * Les deltas sont les mêmes quel que soit le référentiel d'affichage (différence
 * de niveaux = invariante par translation).
 */
function Cell({
  label,
  value,
  formatter,
}: {
  label: string;
  value: number | null;
  formatter: (v: number) => { text: string; color: string };
}) {
  if (value === null || value === undefined) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-lg font-bold mt-1 tabular-nums">—</div>
      </div>
    );
  }
  const { text, color } = formatter(value);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 tabular-nums ${color}`}>{text}</div>
    </div>
  );
}

function signedColor(v: number): string {
  return v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "";
}

// Trend en m/j : auto cm/j si |v| < 1.
function trendFormatter(v: number) {
  const abs = Math.abs(v);
  const text = abs < 1
    ? `${v >= 0 ? "+" : ""}${Math.round(v * 100)} cm/j`
    : `${v >= 0 ? "+" : ""}${v.toFixed(2)} m/j`;
  return { text, color: signedColor(v) };
}

function deltaFormatter(v: number) {
  return { text: formatDelta(v), color: signedColor(v) };
}

export default function KpiGrid({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      <Cell label="Tendance sur 7 jours" value={kpis.trend7dMPerDay} formatter={trendFormatter} />
      <Cell label="VS Hier" value={kpis.vsJ1} formatter={deltaFormatter} />
      <Cell label="VS il y a 3 jours" value={kpis.vsJ3} formatter={deltaFormatter} />
      <Cell label="VS il y a une semaine" value={kpis.vsS1} formatter={deltaFormatter} />
    </div>
  );
}
