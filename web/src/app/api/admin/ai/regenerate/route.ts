import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Rate-limit en mémoire : 1 régénération toutes les 5 minutes.
// (in-memory suffit : Next.js est mono-process et un seul user pousse le bouton)
let lastTriggerAt = 0;
const RATE_LIMIT_MS = 5 * 60 * 1000;

// Le binaire est installé par uv au déploiement (lac-ai-refresher script).
// En prod : /var/lib/lac/.uv-cache/.../bin/lac-ai-refresher OU /opt/lac/worker/.venv/bin/lac-ai-refresher
// On laisse uv le résoudre via `uv run --no-sync lac-ai-refresher --force`.
const WORKER_DIR = process.env.LAC_WORKER_DIR ?? "/opt/lac/worker";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status });

  const now = Date.now();
  if (now - lastTriggerAt < RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((RATE_LIMIT_MS - (now - lastTriggerAt)) / 1000);
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_seconds: retryAfter },
      { status: 429 }
    );
  }
  lastTriggerAt = now;

  // Spawn détaché : on ne bloque pas la requête. Le résultat sera visible
  // via /api/ai/status (last_run_status) une fois le sous-process terminé.
  try {
    const child = spawn("uv", ["run", "--no-sync", "lac-ai-refresher", "--force"], {
      cwd: WORKER_DIR,
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    return NextResponse.json({ ok: true, pid: child.pid });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "spawn_failed", message: String(err) },
      { status: 500 }
    );
  }
}
