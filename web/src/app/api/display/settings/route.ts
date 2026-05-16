import { NextResponse } from "next/server";
import { getLevelReferences } from "@/lib/db";

export const dynamic = "force-dynamic";

// Endpoint public consommé par le DisplayProvider côté client.
// Renvoie les références nécessaires pour convertir un niveau mNGF
// vers les 2 référentiels relatifs (ponton, minimum historique).
export async function GET() {
  const refs = getLevelReferences();
  return NextResponse.json(refs, {
    // Le min historique change très rarement (que si un nouveau record bas est atteint).
    // 5 min de cache suffisent pour éviter de spammer la DB.
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
