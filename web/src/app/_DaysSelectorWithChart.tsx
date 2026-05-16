"use client";

import ColoredCurveChart from "./_ColoredCurveChart";
import DaysSelector from "@/components/DaysSelector";
import { type ChartThreshold } from "@/components/WaterChart";
import { useEffect, useState } from "react";

type Measure = { datetime_event: string; value: number };

/**
 * Taille de bucket (en heures) pour le resampling, adaptée à la fenêtre :
 * - Petite fenêtre = segments fins (= plus de couleurs)
 * - Grande fenêtre = segments épais (= performance + lisibilité)
 */
function segmentHoursFor(days: number): number {
  if (days <= 1) return 1;     // 1j → 24 segments horaires
  if (days <= 3) return 1;     // segments horaires sur 3j → ~72 segments
  if (days <= 7) return 2;     // ~84
  if (days <= 14) return 3;    // ~112
  if (days <= 30) return 6;    // ~120
  if (days <= 60) return 8;    // ~180
  if (days <= 90) return 12;   // ~180
  if (days <= 180) return 18;  // ~240
  return 24;                   // 1 segment/jour pour 1 an
}

/**
 * Seuil de pente (m/heure) au-delà duquel la couleur est saturée :
 * petite fenêtre = on est sensible aux variations rapides,
 * grande fenêtre = on lisse pour ne pas tout colorer en rouge vif.
 */
function slopeThresholdFor(days: number): number {
  if (days <= 1) return 0.04;
  if (days <= 3) return 0.03;
  if (days <= 7) return 0.025;
  if (days <= 14) return 0.02;
  if (days <= 30) return 0.015;
  if (days <= 60) return 0.012;
  if (days <= 90) return 0.01;
  if (days <= 180) return 0.009;
  return 0.008;
}

export default function DaysSelectorWithChart({
  thresholds,
}: {
  thresholds: ChartThreshold[];
}) {
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

  return (
    <>
      <DaysSelector value={days} onChange={setDays} />
      <ColoredCurveChart
        measures={measures}
        thresholds={thresholds}
        segmentSizeHours={segmentHoursFor(days)}
        slopeThreshold={slopeThresholdFor(days)}
        height={300}
      />
      {loading && <p className="text-xs text-slate-500 mt-2">Chargement…</p>}
    </>
  );
}
