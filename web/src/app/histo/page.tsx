import { getThresholds } from "@/lib/db";
import HistoChart from "./_HistoChart";

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
          dashStyle:
            t.dash_style === "dash" || t.dash_style === "longdash"
              ? "dashed"
              : t.dash_style === "dot"
                ? "dotted"
                : "solid",
        }))}
      />
    </div>
  );
}
