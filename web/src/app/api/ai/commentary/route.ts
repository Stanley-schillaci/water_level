import { NextResponse } from "next/server";
import { getLatestAICommentary } from "@/lib/db";

export const dynamic = "force-dynamic";

// V2.3+ : il n'y a plus qu'une seule phrase IA (kind="tendance").
// Le paramètre ?kind est conservé pour compat avec d'anciens clients PWA
// cachés ; tout autre valeur (ou absence) renvoie la phrase tendance.
export async function GET() {
  const text = getLatestAICommentary("tendance");
  return NextResponse.json({ kind: "tendance", text });
}
