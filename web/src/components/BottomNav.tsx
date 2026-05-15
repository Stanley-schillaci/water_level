"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: "💧", aria: "Niveau actuel" },
  { href: "/annuel", icon: "📈", aria: "Comparaison annuelle et historique" },
  { href: "/options", icon: "⚙️", aria: "Options" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 pt-2 pb-[env(safe-area-inset-bottom,8px)] flex"
    >
      {items.map((it) => {
        const active = path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-label={it.aria}
            className={`flex-1 flex items-center justify-center py-2 ${
              active ? "opacity-100" : "opacity-50"
            }`}
          >
            <span className="text-2xl">{it.icon}</span>
          </Link>
        );
      })}
    </nav>
  );
}
