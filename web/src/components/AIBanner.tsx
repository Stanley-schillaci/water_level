type Props = { text: string | null; ageMinutes: number | null };

function formatAge(ageMinutes: number): string {
  if (ageMinutes < 1) return "à l'instant";
  if (ageMinutes < 60) return `il y a ${ageMinutes} min`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(ageMinutes / 1440);
  return `il y a ${days} j`;
}

export default function AIBanner({ text, ageMinutes }: Props) {
  if (!text) {
    return (
      <div className="rounded-lg bg-slate-100 dark:bg-slate-900 px-4 py-3 mb-4 text-sm text-slate-500">
        Pas de commentaire IA disponible.
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 px-4 py-3 mb-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="mr-1">✨</span>
          {text}
        </div>
        {ageMinutes !== null && (
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap mt-0.5">
            {formatAge(ageMinutes)}
          </span>
        )}
      </div>
    </div>
  );
}
