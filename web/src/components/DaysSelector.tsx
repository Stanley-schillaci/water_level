"use client";

const OPTIONS = [3, 7, 30, 90, 365];

export default function DaysSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1 mb-3 overflow-x-auto -mx-1 px-1">
      {OPTIONS.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${
            value === n
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
          }`}
        >
          {n}j
        </button>
      ))}
    </div>
  );
}
