import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteThreshold, updateThreshold } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  value: z.number().min(600).max(700),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dash_style: z.enum(["solid", "dash", "dot", "dashdot", "longdash"]),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const { id } = await ctx.params;
  const idNum = Number.parseInt(id, 10);
  if (!Number.isFinite(idNum)) return NextResponse.json({ ok: false }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten() },
      { status: 400 }
    );
  }
  updateThreshold(idNum, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });
  const { id } = await ctx.params;
  const idNum = Number.parseInt(id, 10);
  if (!Number.isFinite(idNum)) return NextResponse.json({ ok: false }, { status: 400 });
  deleteThreshold(idNum);
  return NextResponse.json({ ok: true });
}
