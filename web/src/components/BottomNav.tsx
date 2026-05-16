"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/", icon: "💧", aria: "Niveau actuel", showBadge: false },
  { href: "/annuel", icon: "📈", aria: "Comparaison annuelle et historique", showBadge: false },
  { href: "/options", icon: "⚙️", aria: "Options", showBadge: true },
];

export default function BottomNav() {
  const path = usePathname();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch("/api/ai/status", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { last_run_status: "ok" | "failed" | null };
        if (!cancelled) setHasError(d.last_run_status === "failed");
      } catch {
        // silencieux : un fail réseau ne doit pas allumer le badge
      }
    }
    poll();
    const id = window.setInterval(poll, 5 * 60_000); // 5 min
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 pt-2 pb-[env(safe-area-inset-bottom,8px)] flex"
    >
      {items.map((it) => {
        const active = path === it.href;
        const showDot = it.showBadge && hasError;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-label={it.aria}
            className={`flex-1 flex items-center justify-center py-2 ${
              active ? "opacity-100" : "opacity-50"
            }`}
          >
            <span className="relative text-2xl">
              {it.icon}
              {showDot && (
                <span
                  aria-label="erreur"
                  className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900"
                />
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
