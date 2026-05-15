import { NextResponse } from "next/server";
import { getRecentMeasures } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysRaw = Number.parseInt(url.searchParams.get("days") ?? "7", 10);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 7;
  const measures = getRecentMeasures(days);
  return NextResponse.json({ days, count: measures.length, measures });
}
