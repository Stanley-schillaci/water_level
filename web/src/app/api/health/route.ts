import { NextResponse } from "next/server";
import { getDb, getLastMeasure } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const last = getLastMeasure();
  const ageMin = last
    ? Math.floor((Date.now() - new Date(last.datetime_event).getTime()) / 60000)
    : null;
  const ok = ageMin !== null && ageMin <= 120;
  const db = getDb();
  const pageCount = db.pragma("page_count", { simple: true });
  const pageSize = db.pragma("page_size", { simple: true });
  const dbSizeMb =
    typeof pageCount === "number" && typeof pageSize === "number"
      ? Math.round((pageCount * pageSize) / 1024 / 1024)
      : null;
  return NextResponse.json(
    {
      status: ok ? "ok" : "stale",
      last_measure_age_min: ageMin,
      db_size_mb: dbSizeMb,
    },
    { status: ok ? 200 : 503 }
  );
}
