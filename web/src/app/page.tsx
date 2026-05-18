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
  // 8 jours et pas 7 : `computeKpis` cherche la mesure d'il y a 7 jours
  // PAR RAPPORT À LA DERNIÈRE MESURE (target = lastDt - 7j). Avec une
  // fenêtre de 7 jours pile, la mesure d'il y a 7j est juste hors fenêtre
  // → vsS1 = null → "VS il y a une semaine" et "Tendance 7j" affichaient "—".
  const measures8d = getRecentMeasures(8);
  const kpis = computeKpis(measures8d);
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
