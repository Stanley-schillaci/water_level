import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getDisplaySettings, savePontonCalibration } from "@/lib/db";

export const dynamic = "force-dynamic";

// La calibration ponton est stockée comme un mNGF (le niveau où l'eau
// commence à toucher la coque). On accepte aussi null pour effacer.
const Body = z.object({
  ponton_calibration_mngf: z
    .number()
    .min(600)
    .max(700)
    .nullable(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  return NextResponse.json({ ok: true, settings: getDisplaySettings() });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  savePontonCalibration(parsed.data.ponton_calibration_mngf);
  return NextResponse.json({ ok: true, settings: getDisplaySettings() });
}
