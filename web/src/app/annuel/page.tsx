import {
  getAvailableYears,
  getRecentMeasures,
  getThresholds,
} from "@/lib/db";
import { computeAnnualKpis } from "@/lib/kpi";
import AnnualChart from "./_AnnualChart";
import FullHistoryChart from "./_FullHistoryChart";

export const dynamic = "force-dynamic";

function Delta({ label, v }: { label: string; v: number | null }) {
  const display = v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)} m`;
  const color =
    v === null ? "" : v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "";
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 tabular-nums ${color}`}>{display}</div>
    </div>
  );
}

export default function AnnualPage() {
  const available = getAvailableYears();
  const longMeasures = getRecentMeasures(365 * 4);
  const annual = computeAnnualKpis(longMeasures);
  const currentYear = new Date().getFullYear();
  const thresholds = getThresholds();
  const thresholdsForChart = thresholds.map((t) => ({
    name: t.name,
    value: t.value,
    color: t.color,
    dashStyle:
      t.dash_style === "dash" || t.dash_style === "longdash"
        ? ("dashed" as const)
        : t.dash_style === "dot"
          ? ("dotted" as const)
          : ("solid" as const),
  }));

  return (
    <div className="space-y-8">
      <section>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Delta label={`VS ${currentYear - 1}`} v={annual.vsY1} />
          <Delta label={`VS ${currentYear - 2}`} v={annual.vsY2} />
          <Delta label={`VS ${currentYear - 3}`} v={annual.vsY3} />
        </div>
        <h2 className="text-sm font-semibold mb-2">Comparaison annuelle</h2>
        <p className="text-xs text-slate-500 mb-2">
          Sélectionne les années à superposer. L&apos;axe X est ramené à une année calendaire (1er janv. → 31 déc.).
        </p>
        <AnnualChart availableYears={available} thresholds={thresholdsForChart} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Historique depuis le 7 juillet 2021</h2>
        <p className="text-xs text-slate-500 mb-2">
          La couleur change à chaque nouvelle année — pour repérer les cycles saisonniers.
        </p>
        <FullHistoryChart thresholds={thresholdsForChart} />
      </section>
    </div>
  );
}
