"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

export type ChartPoint = { x: string; y: number };
export type ChartLine = { name: string; data: ChartPoint[]; color?: string };
export type ChartThreshold = {
  name: string;
  value: number;
  color: string;
  dashStyle?: "solid" | "dashed" | "dotted";
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
  yLabel = "Niveau (m)",
  xAxisType = "time",
  height = 280,
}: Props) {
  const option = useMemo(() => {
    const series = lines.map((l, i) => ({
      name: l.name,
      type: "line" as const,
      data: l.data.map((p) => [p.x, p.y]),
      showSymbol: false,
      smooth: 0.2,
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
    }));
    return {
      grid: { left: 40, right: 12, top: 16, bottom: 24 },
      tooltip: { trigger: "axis", confine: true },
      xAxis: {
        type: xAxisType,
        axisLabel: { fontSize: 10 },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        name: yLabel,
        nameTextStyle: { fontSize: 10 },
        scale: true,
        axisLabel: { fontSize: 10 },
      },
      legend:
        lines.length > 1 ? { bottom: 0, type: "scroll" as const, itemHeight: 8 } : undefined,
      dataZoom: [{ type: "inside" as const }],
      series,
    };
  }, [lines, thresholds, xAxisType, yLabel]);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-2"
      style={{ touchAction: "none" }}
    >
      <ReactECharts option={option} style={{ height, width: "100%" }} notMerge={true} />
    </div>
  );
}
