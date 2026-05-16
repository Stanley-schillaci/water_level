import OptionsClient from "./_OptionsClient";
import { getDb, getLastMeasure, getLatestAICommentary } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function OptionsPage() {
  const last = getLastMeasure();
  const lastAIRaw = getLatestAICommentary("tendance");

  // Récupère l'âge en minutes de la dernière phrase IA pour le monitoring.
  // (la "phrase annuelle" a été supprimée en V2.3, plus qu'une seule phrase "tendance")
  //
  // IMPORTANT : on calcule l'âge en SQL via strftime('%s','now') - strftime('%s', created_at)
  // parce que gpt_logs.created_at est stocké en UTC (CURRENT_TIMESTAMP SQLite). Si on
  // passait la string brute au client, new Date("YYYY-MM-DD HH:MM:SS") l'interpréterait
  // comme local time (Paris CEST = UTC+2 en été) et on aurait 2h d'écart par rapport
  // au AIBanner de la home (qui lui calcule l'âge en SQL).
  const db = getDb();
  const lastAIRow = db
    .prepare(
      `SELECT CAST((strftime('%s','now') - strftime('%s', created_at)) / 60 AS INTEGER) AS age_minutes
       FROM gpt_logs WHERE type = 'tendance' ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { age_minutes: number } | undefined;

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
      lastTendanceAgeMinutes={lastAIRow?.age_minutes ?? null}
      hasLastTendance={lastAIRaw !== null}
      dbSizeMb={dbSizeMb}
      totalMeasures={totalMeasures}
    />
  );
}
