"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { ChartThreshold } from "@/components/WaterChart";

type Measure = { datetime_event: string; value: number };

type Props = {
  measures: Measure[];
  thresholds: ChartThreshold[];
  /** Taille de chaque segment en heures. Plus c'est grand, moins on a de segments. */
  segmentSizeHours?: number;
  /**
   * Pente (m/heure) à partir de laquelle on considère la couleur saturée.
   * Pente > +threshold = vert vif, pente < -threshold = rouge vif.
   */
  slopeThreshold?: number;
  yLabel?: string;
  height?: number;
};

/**
 * Regroupe les mesures par "buckets" de `hours` heures et prend la moyenne.
 * Évite la sur-segmentation quand on a 144 mesures/jour.
 */
function resampleHourly(measures: Measure[], hours: number): Measure[] {
  if (measures.length === 0) return [];
  const bucketMs = hours * 3_600_000;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const m of measures) {
    const t = new Date(m.datetime_event).getTime();
    if (Number.isNaN(t)) continue;
    const bucketTime = Math.floor(t / bucketMs) * bucketMs;
    const b = buckets.get(bucketTime) ?? { sum: 0, count: 0 };
    b.sum += m.value;
    b.count++;
    buckets.set(bucketTime, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucketTime, b]) => ({
      datetime_event: new Date(bucketTime).toISOString().replace("T", " ").slice(0, 19),
      value: b.sum / b.count,
    }));
}

/**
 * Map une pente (m/heure) à une couleur RGB :
 * - pente > +threshold → vert vif (0,255,0)
 * - pente <  0 et > -threshold → rouge foncé (150,0,0)
 * - pente < -threshold → rouge vif (255,0,0)
 * - pente == 0 → vert foncé (0,150,0)
 *
 * Reproduit exactement la logique de la V1 Streamlit (webapp/plotly_chart.py).
 */
function slopeToColor(slopePerHour: number, threshold: number): string {
  const v = Math.max(-1, Math.min(1, slopePerHour / threshold));
  if (v >= 0) {
    const g = Math.round(150 + 105 * v);
    return `rgb(0,${g},0)`;
  }
  const r = Math.round(150 + 105 * -v);
  return `rgb(${r},0,0)`;
}

export default function ColoredCurveChart({
  measures,
  thresholds,
  segmentSizeHours = 1,
  slopeThreshold = 0.03,
  yLabel = "Niveau (m)",
  height = 300,
}: Props) {
  const option = useMemo(() => {
    const resampled = resampleHourly(measures, segmentSizeHours);
    if (resampled.length < 2) {
      return {
        grid: { left: 40, right: 12, top: 16, bottom: 24 },
        xAxis: { type: "time" as const },
        yAxis: { type: "value" as const, name: yLabel, scale: true },
        series: [],
      };
    }

    // Un segment = 2 points consécutifs avec une couleur dérivée de la pente locale.
    type Segment = { from: Measure; to: Measure; color: string };
    const segments: Segment[] = [];
    for (let i = 1; i < resampled.length; i++) {
      const prev = resampled[i - 1];
      const cur = resampled[i];
      const slope = (cur.value - prev.value) / segmentSizeHours;
      segments.push({ from: prev, to: cur, color: slopeToColor(slope, slopeThreshold) });
    }

    // Chaque segment devient une mini-série ECharts. Avec `silent: true` et
    // `tooltip: { show: false }`, ces séries n'apparaissent ni dans la légende
    // ni dans le tooltip.
    const segmentSeries = segments.map((seg, i) => ({
      id: `seg-${i}`,
      type: "line" as const,
      data: [
        [seg.from.datetime_event, seg.from.value],
        [seg.to.datetime_event, seg.to.value],
      ],
      showSymbol: false,
      lineStyle: { color: seg.color, width: 3 },
      itemStyle: { color: seg.color },
      color: seg.color,
      silent: true,
      animation: false,
      tooltip: { show: false },
      z: 1,
    }));

    // Série "porteuse" invisible — c'est elle qui sert au tooltip et qui porte
    // les markLines (lignes de seuil).
    const tooltipSeries = {
      id: "main",
      name: "Niveau",
      type: "line" as const,
      data: resampled.map((m) => [m.datetime_event, m.value]),
      showSymbol: false,
      lineStyle: { width: 0, color: "transparent" },
      itemStyle: { color: "transparent" },
      color: "transparent",
      z: 2,
      markLine:
        thresholds.length > 0
          ? {
              symbol: "none",
              silent: true,
              lineStyle: { type: "dashed" as const },
              data: thresholds.map((t) => ({
                yAxis: t.value,
                lineStyle: { color: t.color, type: t.dashStyle ?? "dashed" },
                label: {
                  formatter: t.name,
                  color: t.color,
                  position: "insideEndTop" as const,
                  fontSize: 10,
                },
              })),
            }
          : undefined,
    };

    return {
      grid: { left: 40, right: 12, top: 16, bottom: 24 },
      tooltip: {
        trigger: "axis" as const,
        confine: true,
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const main = arr.find(
            (p: unknown) => (p as { seriesId?: string }).seriesId === "main",
          ) as { value: [string, number] } | undefined;
          if (!main) return "";
          const dt = new Date(main.value[0]).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return `${dt}<br/><b>${main.value[1].toFixed(2)} m</b>`;
        },
      },
      xAxis: {
        type: "time" as const,
        axisLabel: { fontSize: 10 },
        boundaryGap: false,
      },
      yAxis: {
        type: "value" as const,
        name: yLabel,
        nameTextStyle: { fontSize: 10 },
        scale: true,
        axisLabel: { fontSize: 10 },
      },
      dataZoom: [{ type: "inside" as const }],
      series: [...segmentSeries, tooltipSeries],
    };
  }, [measures, thresholds, segmentSizeHours, slopeThreshold, yLabel]);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-2"
      style={{ touchAction: "none" }}
    >
      <ReactECharts option={option} style={{ height, width: "100%" }} notMerge={true} />
    </div>
  );
}
