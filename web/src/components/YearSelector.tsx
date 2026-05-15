"use client";

export default function YearSelector({
  available,
  selected,
  onChange,
}: {
  available: number[];
  selected: number[];
  onChange: (years: number[]) => void;
}) {
  const toggle = (y: number) => {
    onChange(
      selected.includes(y) ? selected.filter((x) => x !== y) : [...selected, y].sort()
    );
  };
  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {available.map((y) => {
        const active = selected.includes(y);
        return (
          <button
            key={y}
            onClick={() => toggle(y)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              active
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
            }`}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}
