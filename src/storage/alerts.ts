/**
 * Persistence for Oracle Arena v2 Alerts.
 * Separate table from the v1 rounds/bids — we keep both running.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Alert } from "../agents/analyst.ts";

const DEFAULT_PATH = "data/oracle-arena.db";

export class AlertStore {
  private db: Database.Database;

  constructor(path: string = process.env.ORACLE_DB_PATH ?? DEFAULT_PATH) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init() {
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
    `);
  }

  save(a: Alert): number {
    const info = this.db
      .prepare(
        `INSERT INTO alerts (ts, analyst, signal_hash, question, category, verdict, confidence, reasoning, tldr, source_cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        a.ts,
        a.analyst,
        a.signal_hash,
        a.question,
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
