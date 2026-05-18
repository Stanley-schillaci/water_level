"use client";

import ColoredCurveChart from "./_ColoredCurveChart";
import DaysSelector from "@/components/DaysSelector";
import { type ChartThreshold } from "@/components/WaterChart";
import { useEffect, useState } from "react";

type Measure = { datetime_event: string; value: number };

// Toujours démarrer sur 1j à chaque ouverture (pas de persistance).
// Volontairement pas de localStorage : ça créait un flicker visible entre
// 1j (SSR) et la dernière valeur stockée (client), avec un risque
// d'incohérence si l'utilisateur tape sur un bouton pendant la transition.
const DEFAULT_DAYS = 1;

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
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch sur changement de days, AVEC annulation de la requête précédente.
  // Sans AbortController, un clic rapide 1j → 7j peut laisser la réponse 1j
  // (plus lente) écraser la réponse 7j (plus rapide) → mauvais graph affiché.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/water/recent?days=${days}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setMeasures(d.measures ?? []))
      .catch((err: unknown) => {
        // AbortError = la requête a été remplacée par une plus récente, OK.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Autre erreur réseau : on garde les measures précédents, pas de toast.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
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
