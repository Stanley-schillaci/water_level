"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: "💧", label: "Now" },
  { href: "/annuel", icon: "📈", label: "Annuel" },
  { href: "/histo", icon: "📊", label: "Histo" },
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
            className={`flex-1 flex flex-col items-center text-[11px] py-1 ${
              active
                ? "text-blue-600 dark:text-blue-400 font-semibold"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <span className="text-xl">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
