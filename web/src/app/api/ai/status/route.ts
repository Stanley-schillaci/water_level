import { NextResponse } from "next/server";
import { getAiStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

// Endpoint public léger (pas d'auth) consommé par le BottomNav pour afficher
// le badge ⚠️ quand la dernière génération AI a échoué. Renvoie le strict
// minimum pour ne rien fuiter (pas de last_error en clair).
export async function GET() {
  const s = getAiStatus();
  return NextResponse.json(
    {
      last_run_at: s.last_run_at,
      last_run_status: s.last_run_status, // "ok" | "failed" | null
    },
    // Cache court côté browser : 60s, sinon poll inutile.
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
