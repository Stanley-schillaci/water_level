import type { Measure } from "./db";

export type Kpis = {
  lastDatetime: string | null;
  level: number | null;
  vsJ1: number | null;
  vsJ3: number | null;
  vsS1: number | null;
  trend7dMPerDay: number | null;
};

export type AnnualKpis = {
  vsY1: number | null;
  vsY2: number | null;
  vsY3: number | null;
};

function valueAtOrBefore(measures: Measure[], target: Date): number | null {
  let best: Measure | null = null;
  for (const m of measures) {
    if (new Date(m.datetime_event) <= target) {
      if (!best || m.datetime_event > best.datetime_event) best = m;
    }
  }
  return best ? best.value : null;
}

export function computeKpis(measures: Measure[]): Kpis {
  if (measures.length === 0) {
    return {
      lastDatetime: null,
      level: null,
      vsJ1: null,
      vsJ3: null,
      vsS1: null,
      trend7dMPerDay: null,
    };
  }
  const last = measures[measures.length - 1];
  const lastDt = new Date(last.datetime_event);
  const level = last.value;

  const sub = (days: number) => new Date(lastDt.getTime() - days * 86_400_000);
  const vJ1 = valueAtOrBefore(measures, sub(1));
  const vJ3 = valueAtOrBefore(measures, sub(3));
  const vS1 = valueAtOrBefore(measures, sub(7));

  return {
    lastDatetime: last.datetime_event,
    level,
    vsJ1: vJ1 !== null ? level - vJ1 : null,
    vsJ3: vJ3 !== null ? level - vJ3 : null,
    vsS1: vS1 !== null ? level - vS1 : null,
    trend7dMPerDay: vS1 !== null ? (level - vS1) / 7 : null,
  };
}

export function computeAnnualKpis(measures: Measure[]): AnnualKpis {
  if (measures.length === 0) return { vsY1: null, vsY2: null, vsY3: null };
  const last = measures[measures.length - 1];
  const lastDt = new Date(last.datetime_event);
  const level = last.value;

  const lookup = (yearsBack: number): number | null => {
    const target = new Date(lastDt.getTime() - yearsBack * 365 * 86_400_000);
    const winStart = target.getTime() - 3 * 86_400_000;
    const winEnd = target.getTime() + 3 * 86_400_000;
    let closest: Measure | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const m of measures) {
      const t = new Date(m.datetime_event).getTime();
      if (t < winStart || t > winEnd) continue;
      const delta = Math.abs(t - target.getTime());
      if (delta < bestDelta) {
        bestDelta = delta;
        closest = m;
      }
    }
    return closest ? level - closest.value : null;
  };

  return { vsY1: lookup(1), vsY2: lookup(2), vsY3: lookup(3) };
}
