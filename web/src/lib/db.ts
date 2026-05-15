import Database from "better-sqlite3";
import path from "path";

let _db: Database.Database | null = null;

function dbPath(): string {
  const p = process.env.LAC_DB_PATH ?? "../niveau_eau.db";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath(), { readonly: false, fileMustExist: false });
  _db.pragma("journal_mode = WAL");
  return _db;
}

export type Measure = { datetime_event: string; value: number };
export type DailyMeasure = { date_event: string; value: number };
export type Threshold = {
  id: number;
  name: string;
  description: string;
  value: number;
  color: string;
  dash_style: string;
};

export function getRecentMeasures(days: number): Measure[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT datetime_event, value FROM water_level
       WHERE datetime_event >= datetime('now', ?)
       ORDER BY datetime_event ASC`
    )
    .all(`-${days} days`) as Measure[];
}

export function getFirstMeasurePerDayForYears(years: number[]): DailyMeasure[] {
  if (years.length === 0) return [];
  const db = getDb();
  const placeholders = years.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT w.date_event, w.value
       FROM water_level w
       JOIN (
         SELECT date_event, MIN(datetime_event) AS min_dt
         FROM water_level
         WHERE CAST(strftime('%Y', date_event) AS INTEGER) IN (${placeholders})
         GROUP BY date_event
       ) sub ON w.date_event = sub.date_event AND w.datetime_event = sub.min_dt
       ORDER BY w.date_event ASC`
    )
    .all(...years) as DailyMeasure[];
}

export function getFullHistory(): DailyMeasure[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT w.date_event, w.value
       FROM water_level w
       JOIN (
         SELECT date_event, MIN(datetime_event) AS min_dt
         FROM water_level
         GROUP BY date_event
       ) sub ON w.date_event = sub.date_event AND w.datetime_event = sub.min_dt
       ORDER BY w.date_event ASC`
    )
    .all() as DailyMeasure[];
}

export function getAvailableYears(): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT CAST(strftime('%Y', date_event) AS INTEGER) AS y
       FROM water_level ORDER BY y ASC`
    )
    .all() as Array<{ y: number }>;
  return rows.map((r) => r.y);
}

export function getLastMeasure(): Measure | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT datetime_event, value FROM water_level
         ORDER BY datetime_event DESC LIMIT 1`
      )
      .get() as Measure | undefined) ?? null
  );
}

export function getThresholds(): Threshold[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, description, value, color, dash_style
       FROM threshold_line WHERE is_deleted = 0 ORDER BY value DESC`
    )
    .all() as Threshold[];
}

export function createThreshold(t: Omit<Threshold, "id">): number {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO threshold_line (name, description, value, color, dash_style)
       VALUES (@name, @description, @value, @color, @dash_style)`
    )
    .run(t);
  return Number(res.lastInsertRowid);
}

export function updateThreshold(id: number, t: Omit<Threshold, "id">): void {
  const db = getDb();
  db.prepare(
    `UPDATE threshold_line SET
       name = @name, description = @description, value = @value,
       color = @color, dash_style = @dash_style,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = @id`
  ).run({ ...t, id });
}

export function deleteThreshold(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE threshold_line SET is_deleted = 1,
       deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(id);
}

export function getLatestAICommentary(kind: "tendance" | "comparaison_annuelle"): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT response FROM gpt_logs
       WHERE type = ? ORDER BY created_at DESC, id DESC LIMIT 1`
    )
    .get(kind) as { response: string } | undefined;
  return row?.response ?? null;
}
