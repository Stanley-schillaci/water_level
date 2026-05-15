"use client";

import DaysSelector from "@/components/DaysSelector";
import WaterChart, { type ChartThreshold } from "@/components/WaterChart";
import { useEffect, useMemo, useState } from "react";

type Measure = { datetime_event: string; value: number };

// Couleurs selon la tendance (slope m/jour calculé sur la fenêtre affichée)
const COLOR_UP = "#16a34a";       // vert (niveau monte)
const COLOR_DOWN = "#dc2626";     // rouge (niveau baisse)
const COLOR_FLAT = "#64748b";     // gris (stable)

// Seuil de "stabilité" en m/jour. En dessous : on considère stable.
const FLAT_THRESHOLD_M_PER_DAY = 0.01;

function computeSlopeColor(measures: Measure[], windowDays: number): string {
  if (measures.length < 2) return COLOR_FLAT;
  const first = measures[0];
  const last = measures[measures.length - 1];
  const slope = (last.value - first.value) / windowDays; // m/jour
  if (slope > FLAT_THRESHOLD_M_PER_DAY) return COLOR_UP;
  if (slope < -FLAT_THRESHOLD_M_PER_DAY) return COLOR_DOWN;
  return COLOR_FLAT;
}

export default function DaysSelectorWithChart({
  thresholds,
}: {
  thresholds: ChartThreshold[];
}) {
  // Par défaut : 3 jours (au lieu de 7)
  const [days, setDays] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    const stored = window.localStorage.getItem("lac-days");
    return stored ? Number.parseInt(stored, 10) || 3 : 3;
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

  const lineColor = useMemo(
    () => computeSlopeColor(measures, days),
    [measures, days]
  );

  return (
    <>
      <DaysSelector value={days} onChange={setDays} />
      <WaterChart
        lines={[
          {
            name: "Niveau",
            color: lineColor,
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
