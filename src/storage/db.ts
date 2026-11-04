/**
 * SQLite-backed round history.
 *
 * Three tables:
 *   rounds    — one row per round (question, truth, winner, pool, timing)
 *   bids      — one row per agent's final bid
 *   receipts  — one row per telegraph purchase or thought event (the raw stream)
 *
 * Keep it dumb: synchronous writes, no migrations yet.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RoundResult } from "../arena/round.ts";

const DEFAULT_PATH = "data/oracle-arena.db";

export class Store {
  private db: Database.Database;

  constructor(path: string = process.env.ORACLE_DB_PATH ?? DEFAULT_PATH) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER NOT NULL,
        question TEXT NOT NULL,
        truth TEXT,
        pool INTEGER NOT NULL,
        winner TEXT,
        reasoning TEXT,
        total_spent_usd REAL
      );

      CREATE TABLE IF NOT EXISTS bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
        agent TEXT NOT NULL,
        answer TEXT,
        confidence REAL,
        reasoning TEXT,
        distance REAL,
        reward INTEGER,
        spent_usd REAL
      );

      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
        agent TEXT NOT NULL,
        ts INTEGER NOT NULL,
        action TEXT NOT NULL,         -- 'buy' | 'think' | 'bid'
        intent TEXT,
        cost_usd REAL,
        signal_hash TEXT,
        note TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_receipts_round ON receipts(round_id);
      CREATE INDEX IF NOT EXISTS idx_bids_round ON bids(round_id);
      CREATE INDEX IF NOT EXISTS idx_rounds_finished ON rounds(finished_at);
    `);
  }

  saveRound(result: RoundResult): number {
    const totalSpent = result.runs.reduce((s, r) => s + r.spent, 0);

    const insertRound = this.db.prepare(`
      INSERT INTO rounds (started_at, finished_at, question, truth, pool, winner, reasoning, total_spent_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBid = this.db.prepare(`
      INSERT INTO bids (round_id, agent, answer, confidence, reasoning, distance, reward, spent_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertReceipt = this.db.prepare(`
      INSERT INTO receipts (round_id, agent, ts, action, intent, cost_usd, signal_hash, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((): number => {
      const roundInfo = insertRound.run(
        result.startedAt,
        result.finishedAt,
        result.question,
        result.truth,
        result.pool,
        result.verdict.winner,
        result.verdict.reasoning,
        totalSpent,
      );
      const roundId = roundInfo.lastInsertRowid as number;

      for (const run of result.runs) {
        const judged = result.verdict.judged.find((j) => j.agent === run.profile.name);
        insertBid.run(
          roundId,
          run.profile.name,
          run.bid?.answer ?? null,
          run.bid?.confidence ?? null,
          run.bid?.reasoning ?? null,
          judged?.distance ?? null,
          judged?.reward ?? 0,
          run.spent,
        );
        for (const r of run.receipts) {
          insertReceipt.run(
            roundId,
            r.agent,
            r.ts,
            r.action,
            r.intent ?? null,
            r.cost_usd ?? null,
            r.signal_hash ?? null,
            r.note ?? null,
          );
        }
      }

      return roundId;
    });

    return tx();
  }

  recent(limit = 10): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT id, finished_at, question, truth, winner, pool, total_spent_usd
         FROM rounds ORDER BY finished_at DESC LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>;
  }

  roundDetail(id: number) {
    const round = this.db.prepare(`SELECT * FROM rounds WHERE id = ?`).get(id);
    const bids = this.db.prepare(`SELECT * FROM bids WHERE round_id = ?`).all(id);
    const receipts = this.db
      .prepare(`SELECT * FROM receipts WHERE round_id = ? ORDER BY ts, id`)
      .all(id);
    return { round, bids, receipts };
  }

  close() {
    this.db.close();
  }
}
