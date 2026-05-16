import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSystemPromptHistory } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  return NextResponse.json({ ok: true, history: getSystemPromptHistory(20) });
}
