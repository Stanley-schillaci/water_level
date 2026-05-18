"use client";

import type { FlowSummary as FlowSummaryData } from "@/lib/kpi";
import { formatDelta } from "@/lib/levelDisplay";

/**
 * Grille 3 colonnes "Apporté / Soutiré / Net" sur la fenêtre courante du
 * sélecteur de jours. Utilise la même esthétique que <KpiGrid>.
 *
 * - Apporté : somme des hausses (toujours ≥ 0, vert)
 * - Soutiré : somme des baisses (toujours ≥ 0 ; affichée avec un préfixe −
 *   pour faire passer le message "ça a baissé de tant", rouge)
 * - Net    : apporté − soutiré (signe = couleur)
 */
function Cell({
  label,
  text,
  color,
}: {
  label: string;
  text: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 tabular-nums ${color}`}>{text}</div>
    </div>
  );
}

function signedColor(v: number): string {
  return v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "";
}

export default function FlowSummary({
  flow,
  days,
}: {
  flow: FlowSummaryData;
  days: number;
}) {
  // Pour Soutiré, on affiche avec un signe − explicite. formatDelta(-lost)
  // produit naturellement "−X cm".
  const apporte = formatDelta(flow.gained);
  const soutire = formatDelta(-flow.lost);
  const net = formatDelta(flow.net);

  return (
    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
        Bilan sur {days} j
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Apporté" text={apporte} color="text-emerald-600" />
        <Cell label="Soutiré" text={soutire} color="text-red-600" />
        <Cell label="Net" text={net} color={signedColor(flow.net)} />
      </div>
    </div>
  );
}
