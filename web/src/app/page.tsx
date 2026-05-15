import AIBanner from "@/components/AIBanner";
import KpiGrid from "@/components/KpiGrid";
import LevelHero from "@/components/LevelHero";
import { getLatestAICommentary, getRecentMeasures, getThresholds } from "@/lib/db";
import { computeKpis } from "@/lib/kpi";
import DaysSelectorWithChart from "./_DaysSelectorWithChart";

export const dynamic = "force-dynamic";

export default async function NowPage() {
  const measures7d = getRecentMeasures(7);
  const kpis = computeKpis(measures7d);
  const banner = getLatestAICommentary("tendance");
  const thresholds = getThresholds();

  return (
    <div>
      <AIBanner text={banner} />
      <LevelHero kpis={kpis} />
      <KpiGrid kpis={kpis} />
      <DaysSelectorWithChart
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
