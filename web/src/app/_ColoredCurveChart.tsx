"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { ChartThreshold } from "@/components/WaterChart";
import { useDisplay } from "@/components/DisplayProvider";
import { convertValue, unitLabel } from "@/lib/levelDisplay";

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
  yLabel,
  height = 300,
}: Props) {
  const { mode, refs } = useDisplay();
  const convertOrSelf = (v: number): number => {
    const c = convertValue(v, mode, refs);
    return c === null ? v : c;
  };
  const effectiveYLabel = yLabel ?? `Niveau (${unitLabel(mode)})`;

  const option = useMemo(() => {
    // On resample d'abord (sur les valeurs brutes mNGF), puis on convertit
    // les valeurs présentées. La pente reste inchangée par offset constant.
    const resampledMngf = resampleHourly(measures, segmentSizeHours);
    const resampled = resampledMngf.map((m) => ({
      datetime_event: m.datetime_event,
      value: convertOrSelf(m.value),
    }));
    if (resampled.length < 2) {
      return {
        grid: { left: 40, right: 12, top: 16, bottom: 24 },
        xAxis: { type: "time" as const },
        yAxis: { type: "value" as const, name: effectiveYLabel, scale: true },
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
              // Labels désactivés (cf. WaterChart.tsx). Les noms des seuils
              // sont consultables depuis /admin > 📍 Seuils visuels.
              data: thresholds.map((t) => ({
                yAxis: convertOrSelf(t.value),
                lineStyle: {
                  color: t.color,
                  type: t.dashStyle ?? "dashed",
                  width: t.width ?? 1,
                },
                label: { show: false },
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
          // main.value[1] est déjà converti dans le référentiel courant.
          const v = main.value[1];
          const formatted = Math.abs(v) < 1 && mode !== "mngf"
            ? `${Math.round(v * 100)} cm`
            : `${v.toFixed(2)} m`;
          return `${dt}<br/><b>${formatted}</b>`;
        },
      },
      xAxis: {
        type: "time" as const,
        axisLabel: { fontSize: 10 },
        boundaryGap: false,
      },
      yAxis: {
        type: "value" as const,
        name: effectiveYLabel,
        nameTextStyle: { fontSize: 10 },
        scale: true,
        axisLabel: {
          fontSize: 10,
          // Force 2 décimales sur les graduations (sinon les conversions
          // mNGF→ponton/min sortent des "2.299999996" dûs aux flottants).
          formatter: (v: number) => v.toFixed(2),
        },
      },
      dataZoom: [{ type: "inside" as const }],
      series: [...segmentSeries, tooltipSeries],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measures, thresholds, segmentSizeHours, slopeThreshold, effectiveYLabel, mode, refs.ponton_calibration_mngf, refs.min_historical?.value]);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-2"
      style={{ touchAction: "none" }}
    >
      <ReactECharts option={option} style={{ height, width: "100%" }} notMerge={true} />
    </div>
  );
}
