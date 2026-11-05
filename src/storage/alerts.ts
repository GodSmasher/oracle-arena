/**
 * Persistence for Oracle Arena v2 Alerts + resolutions.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Alert } from "../agents/analyst.ts";

const DEFAULT_PATH = "data/oracle-arena.db";

export interface Resolution {
  question_key: string;        // normalized question text, so we match across signal_hashes
  outcome: "YES" | "NO";       // ground truth
  resolved_at: number;
  source: string;              // 'manual' | 'polymarket' | 'claude-resolver' | ...
  notes?: string;
}

export interface AnalystScore {
  analyst: string;
  alerts: number;
  resolved: number;
  hits: number;                // verdict matched outcome
  hit_rate: number;            // 0..1
  brier: number;               // avg squared error; lower is better
  avg_confidence: number;
}

export class AlertStore {
  private db: Database.Database;

  constructor(path: string = process.env.ORACLE_DB_PATH ?? DEFAULT_PATH) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init() {
    // Base schema: v2 alerts without question_key (that is added in the migration below
    // so existing databases from before this feature keep working).
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        analyst TEXT NOT NULL,
        signal_hash TEXT NOT NULL,
        question TEXT NOT NULL,
        category TEXT NOT NULL,
        verdict TEXT NOT NULL,
        confidence REAL NOT NULL,
        reasoning TEXT,
        tldr TEXT,
        source_cost_usd REAL
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_analyst ON alerts(analyst, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_signal ON alerts(signal_hash);
      CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts DESC);

      CREATE TABLE IF NOT EXISTS resolutions (
        question_key TEXT PRIMARY KEY,
        outcome TEXT NOT NULL,
        resolved_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        notes TEXT
      );
    `);

    // Migration: add question_key column + index + backfill
    const cols = this.db.prepare("PRAGMA table_info(alerts)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "question_key")) {
      this.db.exec(`ALTER TABLE alerts ADD COLUMN question_key TEXT NOT NULL DEFAULT ''`);
      const rows = this.db.prepare("SELECT id, question FROM alerts").all() as Array<{ id: number; question: string }>;
      const upd = this.db.prepare("UPDATE alerts SET question_key = ? WHERE id = ?");
      const tx = this.db.transaction(() => {
        for (const r of rows) upd.run(questionKey(r.question), r.id);
      });
      tx();
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_qkey ON alerts(question_key)`);
  }

  save(a: Alert): number {
    const info = this.db
      .prepare(
        `INSERT INTO alerts (ts, analyst, signal_hash, question, question_key, category, verdict, confidence, reasoning, tldr, source_cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        a.ts,
        a.analyst,
        a.signal_hash,
        a.question,
        questionKey(a.question),
        a.category,
        a.verdict,
        a.confidence,
        a.reasoning,
        a.tldr,
        a.source_cost_usd,
      );
    return info.lastInsertRowid as number;
  }

  recent(limit = 20, analyst?: string): Array<Record<string, unknown>> {
    if (analyst) {
      return this.db
        .prepare(`SELECT * FROM alerts WHERE analyst = ? ORDER BY ts DESC LIMIT ?`)
        .all(analyst, limit) as Array<Record<string, unknown>>;
    }
    return this.db
      .prepare(`SELECT * FROM alerts ORDER BY ts DESC LIMIT ?`)
      .all(limit) as Array<Record<string, unknown>>;
  }

  /**
   * Record the ground truth for a question. Updates every alert that targeted
   * the same question (same normalized text), across all analysts.
   */
  resolve(r: Resolution): number {
    this.db
      .prepare(
        `INSERT INTO resolutions (question_key, outcome, resolved_at, source, notes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(question_key) DO UPDATE SET
           outcome=excluded.outcome,
           resolved_at=excluded.resolved_at,
           source=excluded.source,
           notes=excluded.notes`,
      )
      .run(r.question_key, r.outcome, r.resolved_at, r.source, r.notes ?? null);
    return this.countAlertsForKey(r.question_key);
  }

  countAlertsForKey(key: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM alerts WHERE question_key = ?`)
      .get(key) as { n: number };
    return row.n;
  }

  /**
   * Distinct unresolved questions, with alert count. Useful for the manual
   * resolution CLI.
   */
  pendingQuestions(limit = 20): Array<{ question_key: string; question: string; category: string; alerts: number }> {
    return this.db
      .prepare(
        `SELECT a.question_key, a.question, a.category, COUNT(*) AS alerts
         FROM alerts a
         LEFT JOIN resolutions r ON r.question_key = a.question_key
         WHERE r.question_key IS NULL
         GROUP BY a.question_key
         ORDER BY alerts DESC, a.question_key
         LIMIT ?`,
      )
      .all(limit) as Array<{ question_key: string; question: string; category: string; alerts: number }>;
  }

  /**
   * Per-analyst scorecard: alerts, hit rate, Brier score, avg confidence.
   */
  scores(): AnalystScore[] {
    const rows = this.db
      .prepare(
        `SELECT
            a.analyst,
            COUNT(*) AS alerts,
            SUM(CASE WHEN r.outcome IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN r.outcome = a.verdict THEN 1 ELSE 0 END) AS hits,
            AVG(CASE WHEN r.outcome IS NOT NULL
                     THEN POWER(a.confidence - (CASE WHEN r.outcome = a.verdict THEN 1.0 ELSE 0.0 END), 2)
                     ELSE NULL END) AS brier,
            AVG(a.confidence) AS avg_confidence
         FROM alerts a
         LEFT JOIN resolutions r ON r.question_key = a.question_key
         GROUP BY a.analyst
         ORDER BY alerts DESC`,
      )
      .all() as Array<{
        analyst: string;
        alerts: number;
        resolved: number | null;
        hits: number | null;
        brier: number | null;
        avg_confidence: number;
      }>;

    return rows.map((r) => ({
      analyst: r.analyst,
      alerts: r.alerts,
      resolved: r.resolved ?? 0,
      hits: r.hits ?? 0,
      hit_rate: (r.resolved ?? 0) > 0 ? (r.hits ?? 0) / (r.resolved ?? 1) : 0,
      brier: r.brier ?? 0,
      avg_confidence: r.avg_confidence,
    }));
  }

  // Kept for backward compat with earlier leaderboard.ts
  countByAnalyst(): Array<{ analyst: string; alerts: number; avg_confidence: number }> {
    return this.db
      .prepare(
        `SELECT analyst, COUNT(*) AS alerts, AVG(confidence) AS avg_confidence
         FROM alerts GROUP BY analyst ORDER BY alerts DESC`,
      )
      .all() as Array<{ analyst: string; alerts: number; avg_confidence: number }>;
  }

  close() {
    this.db.close();
  }
}

/**
 * Normalize a question so near-duplicate wordings collapse to the same key.
 * The daemon regularly emits the same question text multiple times with
 * different signal_hashes; we want those to share a resolution.
 */
export function questionKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
