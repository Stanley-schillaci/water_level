import OptionsClient from "./_OptionsClient";
import { getDb, getLastMeasure, getLatestAICommentary } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function OptionsPage() {
  const last = getLastMeasure();
  const lastAIRaw = getLatestAICommentary("tendance");

  // Récupère la date de génération de la dernière phrase IA pour le monitoring.
  // (la "phrase annuelle" a été supprimée en V2.3, plus qu'une seule phrase "tendance")
  const db = getDb();
  const lastAIRow = db
    .prepare(
      `SELECT created_at FROM gpt_logs WHERE type = 'tendance' ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { created_at: string } | undefined;

  const pageCount = db.pragma("page_count", { simple: true });
  const pageSize = db.pragma("page_size", { simple: true });
  const dbSizeMb =
    typeof pageCount === "number" && typeof pageSize === "number"
      ? Math.round((pageCount * pageSize) / 1024 / 1024)
      : null;

  const totalMeasures = (db.prepare(`SELECT COUNT(*) AS n FROM water_level`).get() as { n: number }).n;

  return (
    <OptionsClient
      lastMeasureAt={last?.datetime_event ?? null}
      lastTendanceAt={lastAIRow?.created_at ?? null}
      hasLastTendance={lastAIRaw !== null}
      dbSizeMb={dbSizeMb}
      totalMeasures={totalMeasures}
    />
  );
}
