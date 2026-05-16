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

// --- AI policy --------------------------------------------------------------
//
// Singleton row (id=1) qui pilote la cadence de génération des phrases IA.
// Auto-bootstrap idempotent : si la table ou la ligne manquent (DB ancienne),
// on les crée à la volée pour ne pas dépendre du worker.

export type AiPolicy = {
  enabled: boolean;
  high_season_months: string;
  high_season_hours: string;
  low_season_hours: string;
  last_run_at: string | null;
  last_run_status: "ok" | "failed" | null;
  last_error: string | null;
  updated_at: string;
};

function ensureAiPolicy(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      high_season_months TEXT NOT NULL DEFAULT '5,6,7,8',
      high_season_hours TEXT NOT NULL DEFAULT '6,10,14,18',
      low_season_hours TEXT NOT NULL DEFAULT '7',
      last_run_at DATETIME,
      last_run_status TEXT,
      last_error TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.prepare(
    `INSERT OR IGNORE INTO ai_policy (id, enabled, high_season_months, high_season_hours, low_season_hours)
     VALUES (1, 1, '5,6,7,8', '6,10,14,18', '7')`
  ).run();
}

export function getAiPolicy(): AiPolicy {
  ensureAiPolicy();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT enabled, high_season_months, high_season_hours, low_season_hours,
              last_run_at, last_run_status, last_error, updated_at
       FROM ai_policy WHERE id = 1`
    )
    .get() as {
    enabled: number;
    high_season_months: string;
    high_season_hours: string;
    low_season_hours: string;
    last_run_at: string | null;
    last_run_status: string | null;
    last_error: string | null;
    updated_at: string;
  };
  return {
    enabled: row.enabled === 1,
    high_season_months: row.high_season_months,
    high_season_hours: row.high_season_hours,
    low_season_hours: row.low_season_hours,
    last_run_at: row.last_run_at,
    last_run_status: (row.last_run_status as "ok" | "failed" | null) ?? null,
    last_error: row.last_error,
    updated_at: row.updated_at,
  };
}

export function saveAiPolicy(p: {
  enabled: boolean;
  high_season_months: string;
  high_season_hours: string;
  low_season_hours: string;
}): void {
  ensureAiPolicy();
  const db = getDb();
  db.prepare(
    `UPDATE ai_policy
     SET enabled = @enabled,
         high_season_months = @high_season_months,
         high_season_hours = @high_season_hours,
         low_season_hours = @low_season_hours,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  ).run({
    enabled: p.enabled ? 1 : 0,
    high_season_months: p.high_season_months,
    high_season_hours: p.high_season_hours,
    low_season_hours: p.low_season_hours,
  });
}

export function getAiStatus(): { last_run_at: string | null; last_run_status: "ok" | "failed" | null } {
  // Endpoint public léger (pas d'auth). Pas d'erreur si DB neuve.
  ensureAiPolicy();
  const db = getDb();
  const row = db
    .prepare(`SELECT last_run_at, last_run_status FROM ai_policy WHERE id = 1`)
    .get() as { last_run_at: string | null; last_run_status: string | null } | undefined;
  if (!row) return { last_run_at: null, last_run_status: null };
  return {
    last_run_at: row.last_run_at,
    last_run_status: (row.last_run_status as "ok" | "failed" | null) ?? null,
  };
}

// --- Display settings -------------------------------------------------------
//
// Singleton (id=1) qui stocke l'étalonnage du référentiel "Sous le ponton".
// Auto-bootstrap idempotent.

export type DisplaySettings = {
  ponton_calibration_mngf: number | null;
  updated_at: string;
};

function ensureDisplaySettings(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS display_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ponton_calibration_mngf REAL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.prepare(
    `INSERT OR IGNORE INTO display_settings (id, ponton_calibration_mngf)
     VALUES (1, NULL)`
  ).run();
}

export function getDisplaySettings(): DisplaySettings {
  ensureDisplaySettings();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ponton_calibration_mngf, updated_at FROM display_settings WHERE id = 1`
    )
    .get() as { ponton_calibration_mngf: number | null; updated_at: string };
  return row;
}

export function savePontonCalibration(value_mngf: number | null): void {
  ensureDisplaySettings();
  const db = getDb();
  db.prepare(
    `UPDATE display_settings
     SET ponton_calibration_mngf = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  ).run(value_mngf);
}

export type LevelReferences = {
  ponton_calibration_mngf: number | null;
  min_historical: { value: number; date: string } | null;
};

export function getLevelReferences(): LevelReferences {
  // Endpoint public consommé par le DisplayContext côté client.
  ensureDisplaySettings();
  const db = getDb();
  const settings = db
    .prepare(`SELECT ponton_calibration_mngf FROM display_settings WHERE id = 1`)
    .get() as { ponton_calibration_mngf: number | null };
  const min = db
    .prepare(
      `SELECT value, date_event FROM water_level
       ORDER BY value ASC LIMIT 1`
    )
    .get() as { value: number; date_event: string } | undefined;
  return {
    ponton_calibration_mngf: settings?.ponton_calibration_mngf ?? null,
    min_historical: min ? { value: min.value, date: min.date_event } : null,
  };
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
