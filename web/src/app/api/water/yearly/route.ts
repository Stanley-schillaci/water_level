import { NextResponse } from "next/server";
import { getAvailableYears, getFirstMeasurePerDayForYears } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearsParam = url.searchParams.get("years");
  let years: number[];
  if (yearsParam) {
    years = yearsParam
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  } else {
    const available = getAvailableYears();
    years = available.slice(-4);
  }
  const measures = getFirstMeasurePerDayForYears(years);
  return NextResponse.json({ years, count: measures.length, measures });
}
