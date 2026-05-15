import type { Kpis } from "@/lib/kpi";

/**
 * Grille des KPIs "delta" :
 * - tendance 7 jours en m/j
 * - delta vs hier, vs il y a 3j, vs sem. dernière
 *
 * Le niveau actuel + dernier relevé sont affichés séparément par <LevelHero/>.
 */
function Cell({
  label,
  value,
  signed = false,
  unit = "",
}: {
  label: string;
  value: number | null;
  signed?: boolean;
  unit?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-lg font-bold mt-1 tabular-nums">—</div>
      </div>
    );
  }
  let display: string;
  let color = "";
  if (signed) {
    display = `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
    color = value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "";
  } else {
    display = value.toFixed(2);
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 tabular-nums ${color}`}>
        {display}
        {unit && <span className="text-xs ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

export default function KpiGrid({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      <Cell label="Tendance sur 7 jours" value={kpis.trend7dMPerDay} signed unit="m/j" />
      <Cell label="VS Hier" value={kpis.vsJ1} signed unit="m" />
      <Cell label="VS il y a 3 jours" value={kpis.vsJ3} signed unit="m" />
      <Cell label="VS il y a une semaine" value={kpis.vsS1} signed unit="m" />
    </div>
  );
}
