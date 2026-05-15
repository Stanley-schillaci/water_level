"use client";

import DaysSelector from "@/components/DaysSelector";
import WaterChart, { type ChartThreshold } from "@/components/WaterChart";
import { useEffect, useState } from "react";

type Measure = { datetime_event: string; value: number };

export default function DaysSelectorWithChart({
  thresholds,
}: {
  thresholds: ChartThreshold[];
}) {
  const [days, setDays] = useState<number>(() => {
    if (typeof window === "undefined") return 7;
    const stored = window.localStorage.getItem("lac-days");
    return stored ? Number.parseInt(stored, 10) || 7 : 7;
  });
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/water/recent?days=${days}`)
      .then((r) => r.json())
      .then((d) => setMeasures(d.measures ?? []))
      .finally(() => setLoading(false));
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lac-days", String(days));
    }
  }, [days]);

  return (
    <>
      <DaysSelector value={days} onChange={setDays} />
      <WaterChart
        lines={[
          {
            name: "Niveau",
            data: measures.map((m) => ({ x: m.datetime_event, y: m.value })),
          },
        ]}
        thresholds={thresholds}
        height={300}
      />
      {loading && <p className="text-xs text-slate-500 mt-2">Chargement...</p>}
    </>
  );
}
