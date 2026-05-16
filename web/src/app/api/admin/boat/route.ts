import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getDisplaySettings, saveBoatSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

// Configuration du bateau : tirant d'eau (m) + marge de vigilance (m).
// Les 2 seuils opérationnels sont dérivés : critique = tirant, vigilance = tirant + marge.
const Body = z.object({
  boat_draft_m: z.number().min(0).max(10),
  vigilance_margin_m: z.number().min(0).max(10),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const s = getDisplaySettings();
  return NextResponse.json({
    ok: true,
    boat_draft_m: s.boat_draft_m,
    vigilance_margin_m: s.vigilance_margin_m,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  saveBoatSettings(parsed.data);
  const s = getDisplaySettings();
  return NextResponse.json({
    ok: true,
    boat_draft_m: s.boat_draft_m,
    vigilance_margin_m: s.vigilance_margin_m,
  });
}
