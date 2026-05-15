import type { Kpis } from "@/lib/kpi";

/**
 * Bloc principal affiché en haut de la page Now :
 * - le niveau actuel en gros
 * - la date/heure de la dernière mesure
 *
 * Sorti volontairement de la KPI grid pour donner de l'air et de la lisibilité
 * (notamment sur iPhone où "15 mai, 23:40" a besoin de largeur).
 */
export default function LevelHero({ kpis }: { kpis: Kpis }) {
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

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mb-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-4xl font-bold tracking-tight tabular-nums">
          {kpis.level.toFixed(2)}
          <span className="text-lg ml-1 font-medium text-slate-500">m</span>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400 leading-tight">
          <div>{longDate} · {time}</div>
          <div className="mt-0.5 opacity-70">{ageLabel}</div>
        </div>
      </div>
    </section>
  );
}
