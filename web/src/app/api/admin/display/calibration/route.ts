import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  addCalibration,
  getActivePonton,
  getCalibrationHistory,
  getDisplaySettings,
} from "@/lib/db";

export const dynamic = "force-dynamic";

// POST body : on saisit ce qu'on a sur place (niveau du lac mNGF, profondeur
// sondeur en m, choix du ponton, note optionnelle). Le calibration_mngf est
// dérivé côté serveur. addCalibration insère dans calibration_history ET met
// à jour la calibration courante du ponton concerné dans display_settings.
const Body = z.object({
  lac_level_mngf: z.number().min(600).max(700),
  sonar_depth_m: z.number().min(0).max(50),
  ponton: z.enum(["fixe", "amovible"]),
  note: z.string().max(500).nullable().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  return NextResponse.json({
    ok: true,
    settings: getDisplaySettings(),
    active_ponton: getActivePonton(),
    history: getCalibrationHistory(5),
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
  addCalibration({
    lac_level_mngf: parsed.data.lac_level_mngf,
    sonar_depth_m: parsed.data.sonar_depth_m,
    ponton: parsed.data.ponton,
    note: parsed.data.note ?? null,
  });
  return NextResponse.json({
    ok: true,
    settings: getDisplaySettings(),
    active_ponton: getActivePonton(),
    history: getCalibrationHistory(5),
  });
}
