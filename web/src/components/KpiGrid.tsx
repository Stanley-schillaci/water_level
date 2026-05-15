import type { Kpis } from "@/lib/kpi";

function Cell({
  label,
  value,
  signed = false,
  unit = "",
}: {
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
      <div className={`text-lg font-bold mt-1 ${color}`}>
        {display}
        {unit && <span className="text-xs ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

export default function KpiGrid({ kpis }: { kpis: Kpis }) {
  const lastDate = kpis.lastDatetime
    ? new Date(kpis.lastDatetime).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
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
