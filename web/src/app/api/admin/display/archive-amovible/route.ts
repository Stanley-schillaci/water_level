import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  archiveAmovibleToFixe,
  getActivePonton,
  getCalibrationHistory,
  getDisplaySettings,
} from "@/lib/db";

export const dynamic = "force-dynamic";

// POST sans body : bascule l'active_ponton de "amovible" vers "fixe" en
// insérant une entrée calibration_history (note="rangement amovible") et
// remet ponton_amovible_calibration_mngf à NULL. Idempotent côté UI (le
// bouton ne s'affiche que si pertinent), mais on protège côté serveur :
// archiveAmovibleToFixe() lève si pas de calibration fixe.
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  try {
    archiveAmovibleToFixe();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    settings: getDisplaySettings(),
    active_ponton: getActivePonton(),
    history: getCalibrationHistory(5),
  });
}
