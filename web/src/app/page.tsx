import AIBanner from "@/components/AIBanner";
import KpiGrid from "@/components/KpiGrid";
import LevelHero from "@/components/LevelHero";
import {
  getAutoZeroLine,
  getLatestAICommentaryWithAge,
  getRecentMeasures,
  getThresholds,
} from "@/lib/db";
import { computeKpis } from "@/lib/kpi";
import type { ChartThreshold } from "@/components/WaterChart";
import DaysSelectorWithChart from "./_DaysSelectorWithChart";

export const dynamic = "force-dynamic";

export default async function NowPage() {
  const measures7d = getRecentMeasures(7);
  const kpis = computeKpis(measures7d);
  const banner = getLatestAICommentaryWithAge("tendance");
  const thresholds = getThresholds();
  const autoZero = getAutoZeroLine();
  // L'ordre importe : la ligne auto en PREMIER pour qu'ECharts la dessine
  // sous les seuils admin et que son label soit en dessous (sinon il chevauche).
  const chartThresholds: ChartThreshold[] = [
    ...(autoZero ? [autoZero] : []),
    ...thresholds.map((t) => ({
      name: t.name,
      value: t.value,
      color: t.color,
      dashStyle:
        t.dash_style === "dash" || t.dash_style === "longdash"
          ? ("dashed" as const)
          : t.dash_style === "dot"
            ? ("dotted" as const)
            : ("solid" as const),
    })),
  ];

  return (
    <div>
      <AIBanner text={banner?.text ?? null} ageMinutes={banner?.ageMinutes ?? null} />
      <LevelHero kpis={kpis} />
      <KpiGrid kpis={kpis} />
      <DaysSelectorWithChart thresholds={chartThresholds} />
    </div>
  );
}
