import { NextResponse } from "next/server";
import { getFullHistory } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const measures = getFullHistory();
  return NextResponse.json({ count: measures.length, measures });
}
