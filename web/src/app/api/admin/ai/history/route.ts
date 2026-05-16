import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAiHistory } from "@/lib/db";

export const dynamic = "force-dynamic";

// Renvoie les N dernières générations IA avec system+user+response complets
// pour monitoring depuis le panel admin.
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  return NextResponse.json({ ok: true, history: getAiHistory(limit) });
}
