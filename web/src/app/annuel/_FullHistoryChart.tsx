"use client";

import WaterChart, { type ChartThreshold, type ChartLine } from "@/components/WaterChart";
import { useEffect, useMemo, useState } from "react";

type DailyMeasure = { date_event: string; value: number };

// Palette stable par année (réutilisée par AnnualChart pour cohérence visuelle).
const YEAR_COLORS = [
  "#2563eb", // 2021
  "#16a34a", // 2022
  "#dc2626", // 2023
  "#f59e0b", // 2024
  "#9333ea", // 2025
  "#0891b2", // 2026
  "#ea580c", // 2027 (au-delà : on cycle)
];

function colorFor(year: number): string {
  // 2021 → index 0, 2022 → 1, etc. ; cycle si > 7 années
  const idx = (year - 2021) % YEAR_COLORS.length;
  return YEAR_COLORS[(idx + YEAR_COLORS.length) % YEAR_COLORS.length];
}

export default function FullHistoryChart({
  thresholds,
}: {
  thresholds: ChartThreshold[];
}) {
  const [data, setData] = useState<DailyMeasure[]>([]);

  useEffect(() => {
    fetch(`/api/water/full`)
      .then((r) => r.json())
      .then((d) => setData(d.measures ?? []));
  }, []);

  // Une série ECharts par année : les segments adjacents prennent automatiquement
  // une couleur différente, ce qui donne l'effet "courbe arc-en-ciel par année"
  // (comme la V1 Streamlit).
  const lines = useMemo<ChartLine[]>(() => {
    const byYear = new Map<number, { x: string; y: number }[]>();
    for (const m of data) {
      const y = Number.parseInt(m.date_event.slice(0, 4), 10);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push({ x: m.date_event, y: m.value });
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, points]) => ({
        name: String(year),
        color: colorFor(year),
        data: points,
      }));
  }, [data]);

  return (
    <WaterChart
      lines={lines}
      thresholds={thresholds}
      height={340}
      xAxisType="time"
    />
  );
}
