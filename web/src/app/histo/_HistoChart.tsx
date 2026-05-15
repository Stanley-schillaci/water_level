"use client";

import WaterChart, { type ChartThreshold } from "@/components/WaterChart";
import { useEffect, useState } from "react";

type DailyMeasure = { date_event: string; value: number };

export default function HistoChart({ thresholds }: { thresholds: ChartThreshold[] }) {
  const [data, setData] = useState<DailyMeasure[]>([]);

  useEffect(() => {
    fetch(`/api/water/full`)
      .then((r) => r.json())
      .then((d) => setData(d.measures ?? []));
  }, []);

  return (
    <WaterChart
      lines={[
        {
          name: "Niveau",
          data: data.map((m) => ({ x: m.date_event, y: m.value })),
        },
      ]}
      thresholds={thresholds}
      height={340}
    />
  );
}
