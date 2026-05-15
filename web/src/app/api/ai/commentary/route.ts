import { NextResponse } from "next/server";
import { getLatestAICommentary } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind") ?? "tendance";
  const kind = kindRaw === "comparaison_annuelle" ? "comparaison_annuelle" : "tendance";
  const text = getLatestAICommentary(kind);
  return NextResponse.json({ kind, text });
}
