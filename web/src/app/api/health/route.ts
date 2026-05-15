import { NextResponse } from "next/server";
import { getDb, getLastMeasure } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const last = getLastMeasure();
  const ageMin = last
    ? Math.floor((Date.now() - new Date(last.datetime_event).getTime()) / 60000)
    : null;
  const ok = ageMin !== null && ageMin <= 120;
  const dbSize = getDb().pragma("page_count * page_size", { simple: true });
  return NextResponse.json(
    {
      status: ok ? "ok" : "stale",
      last_measure_age_min: ageMin,
      db_size_mb: typeof dbSize === "number" ? Math.round(dbSize / 1024 / 1024) : null,
    },
    { status: ok ? 200 : 503 }
  );
}
