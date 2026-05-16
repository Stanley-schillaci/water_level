import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAiPolicy, saveAiPolicy } from "@/lib/db";

export const dynamic = "force-dynamic";

// Validation : on accepte "5,6,7,8" (CSV de petits entiers) ou "" (vide).
// Mois: 1..12. Heures: 0..23. Doublons tolérés (set côté worker).
const CSV_INTS = (min: number, max: number) =>
  z
    .string()
    .max(200)
    .refine(
      (s) => {
        if (s.trim() === "") return true;
        return s.split(",").every((c) => {
          const n = Number.parseInt(c.trim(), 10);
          return Number.isInteger(n) && n >= min && n <= max;
        });
      },
      { message: `entiers entre ${min} et ${max} séparés par des virgules` }
    );

const Body = z.object({
  enabled: z.boolean(),
  high_season_months: CSV_INTS(1, 12),
  high_season_hours: CSV_INTS(0, 23),
  low_season_hours: CSV_INTS(0, 23),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  return NextResponse.json({ ok: true, policy: getAiPolicy() });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  saveAiPolicy(parsed.data);
  return NextResponse.json({ ok: true, policy: getAiPolicy() });
}
