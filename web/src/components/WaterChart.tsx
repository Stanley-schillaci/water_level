"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { useDisplay } from "@/components/DisplayProvider";
import { convertValue, unitLabel } from "@/lib/levelDisplay";

export type ChartPoint = { x: string; y: number };
export type ChartLine = { name: string; data: ChartPoint[]; color?: string };
export type ChartThreshold = {
  name: string;
  value: number;
  color: string;
  dashStyle?: "solid" | "dashed" | "dotted";
  // Largeur du trait. Permet de mettre en avant la ligne "zéro ponton" auto
  // (épaisse + traits pleins) face aux seuils admin (fins + pointillés).
  width?: number;
};

type Props = {
  lines: ChartLine[];
  thresholds?: ChartThreshold[];
  yLabel?: string;
  xAxisType?: "time" | "category";
  height?: number;
};

const ACCENT = "#2563eb";

export default function WaterChart({
  lines,
  thresholds = [],
  yLabel,
  xAxisType = "time",
  height = 280,
}: Props) {
  const { mode, refs } = useDisplay();
  const convertOrSelf = (v: number): number => {
    const c = convertValue(v, mode, refs);
    return c === null ? v : c;
  };
  const effectiveYLabel = yLabel ?? `Niveau (${unitLabel(mode)})`;
  const option = useMemo(() => {
    const series = lines.map((l, i) => ({
      name: l.name,
      type: "line" as const,
      data: l.data.map((p) => [p.x, convertOrSelf(p.y)]),
      showSymbol: false,
      smooth: 0.2,
      // `color` au niveau série pilote la pastille du tooltip ; sans ça
      // ECharts utilise une couleur du thème ≠ celle de la ligne.
      color: l.color ?? (i === 0 ? ACCENT : undefined),
      itemStyle: { color: l.color ?? (i === 0 ? ACCENT : undefined) },
      lineStyle: { color: l.color ?? (i === 0 ? ACCENT : undefined), width: 2 },
      areaStyle:
        lines.length === 1
          ? {
              color: {
                type: "linear" as const,
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${l.color ?? ACCENT}55` },
                  { offset: 1, color: `${l.color ?? ACCENT}00` },
                ],
              },
            }
          : undefined,
      markLine:
        thresholds.length > 0 && i === 0
          ? {
              symbol: "none",
              silent: true,
              lineStyle: { type: "dashed" as const },
              // Anti-chevauchement des labels : on alterne gauche/droite
              // selon l'index, et on ajoute un background semi-opaque pour
              // que le texte reste lisible même quand la courbe passe dessous.
              // Sur mobile le chart est étroit donc 2 labels à la même
              // verticale finissent superposés ; alterner double la place.
              data: thresholds.map((t, idx) => ({
                yAxis: convertOrSelf(t.value),
                lineStyle: {
                  color: t.color,
                  type: t.dashStyle ?? "dashed",
                  width: t.width ?? 1,
                },
                label: {
                  formatter: t.name,
                  color: t.color,
                  position: (idx % 2 === 0
                    ? "insideStartTop"
                    : "insideEndTop") as "insideStartTop" | "insideEndTop",
                  fontSize: 9,
                  padding: [2, 4, 2, 4],
                  backgroundColor: "rgba(255,255,255,0.85)",
                  borderRadius: 3,
                },
              })),
            }
          : undefined,
    }));
    // Top et bottom du grid sont calculés pour ménager :
    // - en haut : la légende multi-lignes (1 par année) qui prend ~24px
    //   par rangée. ECharts wrap automatiquement → on alloue ~52px.
    // - en bas : les labels d'axe X et le scroll des dataZoom inline.
    const hasLegend = lines.length > 1;
    return {
      grid: {
        left: 40,
        right: 12,
        top: hasLegend ? 52 : 16,
        bottom: 24,
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        // Force 2 décimales pour éviter "2.299999996" lié aux flottants après
        // conversion (mNGF − calibration ponton, par exemple).
        valueFormatter: (v: unknown) =>
          typeof v === "number" ? `${v.toFixed(2)} m` : String(v),
      },
      xAxis: {
        type: xAxisType,
        axisLabel: { fontSize: 10 },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        name: effectiveYLabel,
        nameTextStyle: { fontSize: 10 },
        scale: true,
        axisLabel: {
          fontSize: 10,
          // Idem pour les graduations de l'axe.
          formatter: (v: number) => v.toFixed(2),
        },
      },
      // Légende en haut (et plus en bas) : sur mobile, la légende au bas
      // recouvrait les labels d'axe X (années → illisible). En haut on
      // garde un wrap natif quand il y a beaucoup d'entrées.
      legend: hasLegend
        ? {
            top: 0,
            type: "scroll" as const,
            itemHeight: 8,
            itemGap: 8,
            textStyle: { fontSize: 10 },
          }
        : undefined,
      dataZoom: [{ type: "inside" as const }],
      series,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, thresholds, xAxisType, effectiveYLabel, mode, refs.ponton_calibration_mngf, refs.min_historical?.value]);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-2"
      style={{ touchAction: "none" }}
    >
      <ReactECharts option={option} style={{ height, width: "100%" }} notMerge={true} />
    </div>
  );
}
