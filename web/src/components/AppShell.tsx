import BottomNav from "./BottomNav";
import { getLastMeasure } from "@/lib/db";

export default function AppShell({ children }: { children: React.ReactNode }) {
  let last: { datetime_event: string; value: number } | null = null;
  try {
    last = getLastMeasure();
  } catch {
    // DB unavailable (e.g. at build time) — render without "updated N min ago"
  }
  const ageMin = last
    ? Math.floor((Date.now() - new Date(last.datetime_event).getTime()) / 60000)
    : null;
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 pt-4 pb-2 sticky top-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur z-10">
        <h1 className="text-lg font-bold tracking-tight">💧 Saints Peyres</h1>
        {ageMin !== null && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mis à jour il y a {ageMin < 60 ? `${ageMin} min` : `${Math.floor(ageMin / 60)} h`}
          </p>
        )}
      </header>
      <main className="flex-1 px-4 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
