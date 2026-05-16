import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_AI_SYSTEM_PROMPT, getDisplaySettings, saveAiSystemPrompt } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(1).max(20_000),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const s = getDisplaySettings();
  return NextResponse.json({
    ok: true,
    prompt: s.ai_system_prompt,
    default_prompt: DEFAULT_AI_SYSTEM_PROMPT,
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
  saveAiSystemPrompt(parsed.data.prompt);
  return NextResponse.json({ ok: true, prompt: getDisplaySettings().ai_system_prompt });
}
