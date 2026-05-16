"use client";

import type { Kpis } from "@/lib/kpi";
import { useDisplay } from "@/components/DisplayProvider";
import { convertValue, formatRelativeMeters, MODE_SHORT_LABELS } from "@/lib/levelDisplay";

/**
 * Bloc principal affiché en haut de la page Now :
 * - le niveau actuel dans le référentiel choisi (mNGF / sous ponton / depuis min)
 * - la date/heure de la dernière mesure
 * - en gris en-dessous : la valeur dans un référentiel alternatif (typiquement mNGF
 *   si on n'est PAS en mode mNGF, pour garder un repère absolu)
 */
export default function LevelHero({ kpis }: { kpis: Kpis }) {
  const { mode, refs } = useDisplay();

  if (kpis.level === null || kpis.lastDatetime === null) {
    return (
      <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-4 text-center">
        <p className="text-sm text-slate-500">Aucune mesure disponible.</p>
      </section>
    );
  }

  const lastDt = new Date(kpis.lastDatetime);
  const longDate = lastDt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  const time = lastDt.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const ageMin = Math.max(0, Math.floor((Date.now() - lastDt.getTime()) / 60_000));
  const ageLabel =
    ageMin < 60
      ? `il y a ${ageMin} min`
      : ageMin < 60 * 24
        ? `il y a ${Math.floor(ageMin / 60)} h`
        : `il y a ${Math.floor(ageMin / 1440)} j`;

  // Valeur principale dans le mode courant.
  const primary = convertValue(kpis.level, mode, refs);
  // Si conversion impossible (mode dispo mais settings cassées), on tombe en mNGF.
  const primaryStr = primary === null
    ? kpis.level.toFixed(2)
    : mode === "mngf"
      ? primary.toFixed(2)
      : formatRelativeMeters(primary).replace(/\s?(m|cm)$/, ""); // on remet l'unité juste après

  const primaryUnit = primary === null
    ? "m"
    : mode === "mngf"
      ? "m"
      : Math.abs(primary) < 1
        ? "cm"
        : "m";

  // Valeur secondaire (en gris) : si on n'est pas en mNGF, on affiche le mNGF en plus.
  const secondary =
    mode === "mngf" ? null : `${kpis.level.toFixed(2)} mNGF`;

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-4xl font-bold tracking-tight tabular-nums leading-none">
          {primaryStr}
          <span className="text-lg ml-1 font-medium text-slate-500">{primaryUnit}</span>
          {mode !== "mngf" && (
            <span className="block text-xs font-normal text-slate-500 mt-1">
              {MODE_SHORT_LABELS[mode]}
            </span>
          )}
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400 leading-snug">
          <div>{longDate} · {time}</div>
          <div className="mt-0.5 opacity-70">{ageLabel}</div>
          {secondary && <div className="mt-1 opacity-70">= {secondary}</div>}
        </div>
      </div>
    </section>
  );
}
