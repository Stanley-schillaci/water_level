import { describe, expect, test } from "vitest";
import { computeAnnualKpis, computeKpis } from "../src/lib/kpi";

const dt = (d: Date) => d.toISOString().replace("T", " ").replace(/\..*/, "");

describe("computeKpis", () => {
  test("returns nulls when no measures", () => {
    const k = computeKpis([]);
    expect(k.level).toBeNull();
    expect(k.vsJ1).toBeNull();
  });

  test("computes deltas vs 1d / 3d / 7d", () => {
    const now = new Date();
    const back = (d: number) => new Date(now.getTime() - d * 86_400_000);
    const m = [
      { datetime_event: dt(back(7)), value: 664.8 },
      { datetime_event: dt(back(3)), value: 665.1 },
      { datetime_event: dt(back(1)), value: 665.3 },
      { datetime_event: dt(now), value: 665.5 },
    ];
    const k = computeKpis(m);
    expect(k.level).toBe(665.5);
    expect(k.vsJ1).toBeCloseTo(0.2, 2);
    expect(k.vsJ3).toBeCloseTo(0.4, 2);
    expect(k.vsS1).toBeCloseTo(0.7, 2);
    expect(k.trend7dMPerDay).toBeCloseTo(0.1, 2);
  });
});

describe("computeAnnualKpis", () => {
  test("returns all nulls when no historical data", () => {
    const now = new Date();
    const m = [{ datetime_event: dt(now), value: 665.0 }];
    const a = computeAnnualKpis(m);
    expect(a).toEqual({ vsY1: null, vsY2: null, vsY3: null });
  });

  test("computes vsY1 when there's a measure ~1 year back", () => {
    const now = new Date();
    const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
    const m = [
      { datetime_event: dt(yearAgo), value: 665.2 },
      { datetime_event: dt(now), value: 665.5 },
    ];
    const a = computeAnnualKpis(m);
    expect(a.vsY1).toBeCloseTo(0.3, 2);
  });
});
