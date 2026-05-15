type Props = { text: string | null };

export default function AIBanner({ text }: Props) {
  if (!text) {
    return (
      <div className="rounded-lg bg-slate-100 dark:bg-slate-900 px-4 py-3 mb-4 text-sm text-slate-500">
        Pas de commentaire IA disponible.
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 px-4 py-3 mb-4 text-sm">
      <span className="mr-1">✨</span>
      {text}
    </div>
  );
}
