"use client";

import WaterChart, { type ChartThreshold } from "@/components/WaterChart";
import YearSelector from "@/components/YearSelector";
import { useEffect, useState } from "react";

type DailyMeasure = { date_event: string; value: number };

const YEAR_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#f59e0b",
  "#9333ea",
  "#0891b2",
  "#ea580c",
];

export default function AnnualChart({
  availableYears,
  thresholds,
}: {
  availableYears: number[];
  thresholds: ChartThreshold[];
}) {
  const defaultYears = availableYears.slice(-4);
  const [selected, setSelected] = useState<number[]>(defaultYears);
  const [data, setData] = useState<DailyMeasure[]>([]);

  useEffect(() => {
    if (selected.length === 0) {
      setData([]);
      return;
    }
    fetch(`/api/water/yearly?years=${selected.join(",")}`)
      .then((r) => r.json())
      .then((d) => setData(d.measures ?? []));
  }, [selected]);

  const byYear = new Map<number, { x: string; y: number }[]>();
  for (const m of data) {
    const year = Number.parseInt(m.date_event.slice(0, 4), 10);
    const mmdd = m.date_event.slice(5);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push({ x: `2000-${mmdd}`, y: m.value });
  }
  const lines = selected.map((y, i) => ({
    name: String(y),
    color: YEAR_COLORS[i % YEAR_COLORS.length],
    data: byYear.get(y) ?? [],
  }));

  return (
    <>
      <YearSelector available={availableYears} selected={selected} onChange={setSelected} />
      <WaterChart lines={lines} thresholds={thresholds} height={320} xAxisType="time" />
    </>
  );
}
