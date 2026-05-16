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

// --- Display settings (V2.3) ------------------------------------------------
//
// Singleton (id=1) qui stocke :
//   - les 2 calibrations en parallèle (ponton fixe + ponton amovible)
//   - les paramètres bateau (tirant d'eau + marge vigilance)
//   - le system prompt IA éditable
//   - (legacy) ponton_calibration_mngf : alias rétro-compat pendant la migration
//
// On garde la table existante et on ajoute les colonnes avec ALTER TABLE
// idempotent. Auto-bootstrap idempotent comme tout le reste.

export const DEFAULT_AI_SYSTEM_PROMPT = `Tu es l'assistant nautique du Lac des Saints Peyres (Tarn). Tu écris UNE phrase courte, en français, pour le propriétaire du bateau (son père). Le ton est celui d'un proche qui jette un œil au lac et résume la situation à voix haute.

LE LIEU
Lac de retenue hydroélectrique. Plein en juin / début juillet, baisse progressive à partir de mi-juillet (irrigation + production électrique). Fin août → septembre c'est la période critique. Le propriétaire est sur la partie peu profonde du lac.

LE BATEAU & LES PONTONS
Le bateau a un tirant d'eau (fourni dans le user prompt). Deux pontons existent :
- PONTON FIXE : ancré béton, articulé. Tient tant que le lac ne descend pas trop bas.
- PONTON AMOVIBLE : plateforme tractée à pied vers le trait d'eau quand le lac baisse.

Le user prompt indique quel ponton est actif. Tu ne donnes JAMAIS d'ordre, tu décris.

STYLE DE LA PHRASE (le plus important)
- COURT. Une phrase, naturelle, comme parlée. Pas un rapport.
- AUCUN chiffre type "666.99 mNGF" ni "tendance +0.049 m/jour". Si tu veux donner la profondeur, arrondis (ex : "2,40 m sous la coque", "il reste 2 m et demi"). Pas de décimales fines.
- Évite les chiffres quand un mot suffit ("stable depuis quelques jours" est mieux que "+0.04 m / 7j").
- Ne cite PAS les noms techniques des seuils admin entre guillemets ("Ponton fixe — partie 1 posée"). Si un seuil personnel est proche et ça vaut le coup, dis-le naturellement ("on approche du niveau où tu commences à t'inquiéter pour le ponton").
- Pas d'emoji. Pas de "✨" ni "💧" au début.
- Pas de jargon ("seuil de vigilance", "seuil critique"). Si tu dois en parler, traduis-le ("la coque touche le fond à 80 cm").

EXEMPLES DE BON TON
- "Encore 2,40 m sous la coque, ça remonte un peu depuis hier, large de marge."
- "Le niveau est stable depuis trois jours, rien à signaler."
- "Ça baisse doucement, plus qu'environ 1,50 m sous la coque — on est encore tranquilles mais surveille."
- "Profondeur correcte, presque inchangée par rapport à hier."

EXEMPLES À NE PAS REPRODUIRE
- "La profondeur sous la coque est de 2.40 m, en légère hausse récente (+0.11 m depuis hier; tendance 7 jours +0.049 m/jour)..." → trop long, trop chiffré.
- "...niveau du lac à 666.99 mNGF encore proche du repère personnel 'Ponton fixe — partie 1 posée' à 666.00 mNGF" → mNGF jamais affiché, pas de nom technique entre guillemets.

CE QUE TU NE FAIS JAMAIS
- Pas de prévision en jours ("dans 8 jours...").
- Pas d'ordre ("déplace le ponton").
- Pas de drame, pas d'effusion.

CONTINUITÉ
Les 7 dernières phrases sont fournies. Si rien n'a bougé, dis-le simplement. Une phrase identique à la précédente est mieux qu'une variation artificielle.`;

export type DisplaySettings = {
  ponton_fixe_calibration_mngf: number | null;
  ponton_amovible_calibration_mngf: number | null;
  boat_draft_m: number;
  vigilance_margin_m: number;
  ai_system_prompt: string;
  updated_at: string;
};

function tableHasColumn(table: string, column: string): boolean {
  const db = getDb();
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function ensureDisplaySettings(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS display_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ponton_calibration_mngf REAL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Migrations idempotentes pour les anciennes DBs (V2.2 → V2.3).
  // ALTER TABLE ADD COLUMN ne supporte pas IF NOT EXISTS en SQLite ; on guard.
  if (!tableHasColumn("display_settings", "ponton_fixe_calibration_mngf")) {
    db.exec(`ALTER TABLE display_settings ADD COLUMN ponton_fixe_calibration_mngf REAL`);
    // Migration data : si une calibration existait avant V2.3, on l'assume "fixe".
    db.exec(`UPDATE display_settings SET ponton_fixe_calibration_mngf = ponton_calibration_mngf WHERE id = 1`);
  }
  if (!tableHasColumn("display_settings", "ponton_amovible_calibration_mngf")) {
    db.exec(`ALTER TABLE display_settings ADD COLUMN ponton_amovible_calibration_mngf REAL`);
  }
  if (!tableHasColumn("display_settings", "boat_draft_m")) {
    db.exec(`ALTER TABLE display_settings ADD COLUMN boat_draft_m REAL NOT NULL DEFAULT 0.8`);
  }
  if (!tableHasColumn("display_settings", "vigilance_margin_m")) {
    db.exec(`ALTER TABLE display_settings ADD COLUMN vigilance_margin_m REAL NOT NULL DEFAULT 0.3`);
  }
  if (!tableHasColumn("display_settings", "ai_system_prompt")) {
    db.exec(`ALTER TABLE display_settings ADD COLUMN ai_system_prompt TEXT NOT NULL DEFAULT ''`);
    db.prepare(`UPDATE display_settings SET ai_system_prompt = ? WHERE id = 1 AND ai_system_prompt = ''`).run(
      DEFAULT_AI_SYSTEM_PROMPT,
    );
  }
  db.prepare(
    `INSERT OR IGNORE INTO display_settings (id, ai_system_prompt) VALUES (1, ?)`,
  ).run(DEFAULT_AI_SYSTEM_PROMPT);
}

function ensureCalibrationHistory(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS calibration_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lac_level_mngf REAL NOT NULL,
      sonar_depth_m REAL NOT NULL,
      calibration_mngf REAL NOT NULL,
      ponton TEXT NOT NULL CHECK (ponton IN ('fixe', 'amovible')),
      note TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function ensureSystemPromptHistory(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_prompt_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function getDisplaySettings(): DisplaySettings {
  ensureDisplaySettings();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ponton_fixe_calibration_mngf, ponton_amovible_calibration_mngf,
              boat_draft_m, vigilance_margin_m, ai_system_prompt, updated_at
       FROM display_settings WHERE id = 1`,
    )
    .get() as DisplaySettings;
  return row;
}

export function saveBoatSettings(p: { boat_draft_m: number; vigilance_margin_m: number }): void {
  ensureDisplaySettings();
  const db = getDb();
  db.prepare(
    `UPDATE display_settings
     SET boat_draft_m = @boat_draft_m,
         vigilance_margin_m = @vigilance_margin_m,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
  ).run(p);
}

export function saveAiSystemPrompt(prompt: string): void {
  ensureDisplaySettings();
  ensureSystemPromptHistory();
  const db = getDb();
  // Insert dans l'historique d'abord (snapshot de la version précédente).
  const current = db
    .prepare(`SELECT ai_system_prompt FROM display_settings WHERE id = 1`)
    .get() as { ai_system_prompt: string };
  if (current.ai_system_prompt !== prompt) {
    db.prepare(`INSERT INTO system_prompt_history (prompt) VALUES (?)`).run(current.ai_system_prompt);
  }
  db.prepare(
    `UPDATE display_settings
     SET ai_system_prompt = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
  ).run(prompt);
}

export function getSystemPromptHistory(limit = 20): Array<{ id: number; prompt: string; created_at: string }> {
  ensureSystemPromptHistory();
  const db = getDb();
  return db
    .prepare(
      `SELECT id, prompt, created_at FROM system_prompt_history
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(limit) as Array<{ id: number; prompt: string; created_at: string }>;
}

export type CalibrationEntry = {
  id: number;
  lac_level_mngf: number;
  sonar_depth_m: number;
  calibration_mngf: number;
  ponton: "fixe" | "amovible";
  note: string | null;
  created_at: string;
};

export function addCalibration(p: {
  lac_level_mngf: number;
  sonar_depth_m: number;
  ponton: "fixe" | "amovible";
  note: string | null;
}): void {
  ensureDisplaySettings();
  ensureCalibrationHistory();
  const calibration_mngf = p.lac_level_mngf - p.sonar_depth_m;
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO calibration_history (lac_level_mngf, sonar_depth_m, calibration_mngf, ponton, note)
     VALUES (@lac_level_mngf, @sonar_depth_m, @calibration_mngf, @ponton, @note)`,
  );
  // Met aussi à jour la calibration courante du ponton concerné.
  const updateFixe = db.prepare(
    `UPDATE display_settings SET ponton_fixe_calibration_mngf = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
  );
  const updateAmovible = db.prepare(
    `UPDATE display_settings SET ponton_amovible_calibration_mngf = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
  );
  const tx = db.transaction(() => {
    insert.run({ ...p, calibration_mngf });
    if (p.ponton === "fixe") updateFixe.run(calibration_mngf);
    else updateAmovible.run(calibration_mngf);
  });
  tx();
}

export function getCalibrationHistory(limit = 20): CalibrationEntry[] {
  ensureCalibrationHistory();
  const db = getDb();
  return db
    .prepare(
      `SELECT id, lac_level_mngf, sonar_depth_m, calibration_mngf, ponton, note, created_at
       FROM calibration_history
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(limit) as CalibrationEntry[];
}

/**
 * Détermine quel ponton est actif (= ponton du dernier étalonnage).
 * Retourne null si aucun étalonnage n'a jamais été fait.
 */
export function getActivePonton(): "fixe" | "amovible" | null {
  ensureCalibrationHistory();
  const db = getDb();
  const row = db
    .prepare(`SELECT ponton FROM calibration_history ORDER BY created_at DESC, id DESC LIMIT 1`)
    .get() as { ponton: "fixe" | "amovible" } | undefined;
  return row?.ponton ?? null;
}

export type LevelReferences = {
  ponton_calibration_mngf: number | null;     // calibration courante du ponton actif
  active_ponton: "fixe" | "amovible" | null;
  min_historical: { value: number; date: string } | null;
};

export function getLevelReferences(): LevelReferences {
  // Endpoint public consommé par le DisplayContext côté client.
  ensureDisplaySettings();
  ensureCalibrationHistory();
  const db = getDb();
  const settings = db
    .prepare(
      `SELECT ponton_fixe_calibration_mngf, ponton_amovible_calibration_mngf
       FROM display_settings WHERE id = 1`,
    )
    .get() as {
    ponton_fixe_calibration_mngf: number | null;
    ponton_amovible_calibration_mngf: number | null;
  };
  const active = getActivePonton();
  const ponton_calibration_mngf =
    active === "fixe"
      ? settings?.ponton_fixe_calibration_mngf ?? null
      : active === "amovible"
        ? settings?.ponton_amovible_calibration_mngf ?? null
        : null;
  const min = db
    .prepare(`SELECT value, date_event FROM water_level ORDER BY value ASC LIMIT 1`)
    .get() as { value: number; date_event: string } | undefined;
  return {
    ponton_calibration_mngf,
    active_ponton: active,
    min_historical: min ? { value: min.value, date: min.date_event } : null,
  };
}

// --- AI history (V2.3) ------------------------------------------------------
//
// Monitoring complet des générations : on retourne system+user+response+tokens
// pour permettre à l'admin de voir exactement ce qui a été envoyé à GPT.

export type AiHistoryEntry = {
  id: number;
  created_at: string;
  type: string;
  model: string | null;
  system_prompt: string | null;
  prompt: string;          // user prompt
  response: string;
  total_tokens: number | null;
};

function ensureGptLogsSystemPromptColumn(): void {
  // Idempotent : la colonne `system_prompt` a été ajoutée en V2.3.
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(gpt_logs)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "system_prompt")) {
    db.exec(`ALTER TABLE gpt_logs ADD COLUMN system_prompt TEXT`);
  }
}

export function getAiHistory(limit = 20): AiHistoryEntry[] {
  ensureGptLogsSystemPromptColumn();
  const db = getDb();
  return db
    .prepare(
      `SELECT id, created_at, type, model, system_prompt, prompt, response, total_tokens
       FROM gpt_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as AiHistoryEntry[];
}

// V2.3+ : il n'y a plus qu'une seule phrase IA (kind="tendance").
// Le type `AiCommentaryKind` est conservé sous forme de literal pour rester
// explicite côté API et faciliter une éventuelle réintroduction d'un 2e type.
export type AiCommentaryKind = "tendance";

export function getLatestAICommentary(kind: AiCommentaryKind): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT response FROM gpt_logs
       WHERE type = ? ORDER BY created_at DESC, id DESC LIMIT 1`
    )
    .get(kind) as { response: string } | undefined;
  return row?.response ?? null;
}

/**
 * Renvoie la phrase IA la plus récente + son âge en minutes calculé en SQL.
 * On passe par SQL (`strftime('%s', 'now') - strftime('%s', created_at)`) car
 * `gpt_logs.created_at` est stocké en UTC (CURRENT_TIMESTAMP SQLite) ; calculer
 * l'âge côté JS demanderait de forcer la conversion timezone et c'est piégeux.
 */
export function getLatestAICommentaryWithAge(
  kind: AiCommentaryKind,
): { text: string; ageMinutes: number } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT response,
              CAST((strftime('%s','now') - strftime('%s', created_at)) / 60 AS INTEGER) AS age_minutes
       FROM gpt_logs
       WHERE type = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(kind) as { response: string; age_minutes: number } | undefined;
  if (!row) return null;
  return { text: row.response, ageMinutes: Math.max(0, row.age_minutes ?? 0) };
}
