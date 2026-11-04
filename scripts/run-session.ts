/**
 * Oracle Arena v2 — live session runner.
 *
 * Reads daemon-produced prediction questions from the free feed, hands each one
 * to all 4 analysts in parallel, prints their alerts in color, and persists
 * them to SQLite.
 *
 * Run: npm run session
 *      npm run session -- 8        # top-interest min 8 only
 *      npm run session -- 7 60     # min_interest 7, run for 60 seconds then exit
 */
import "dotenv/config";
import OpenAI from "openai";
import { streamNewSignals, queryFeed } from "../src/telegraph/daemon.ts";
import { analyzeSignal, type Alert } from "../src/agents/analyst.ts";
import { ANALYSTS } from "../src/arena/analysts.ts";
import { AlertStore } from "../src/storage/alerts.ts";

const minInterest = Number(process.argv[2] ?? 7);
const runSeconds = Number(process.argv[3] ?? 0); // 0 = run forever

const COLOR: Record<string, string> = {
  magenta: "\x1b[35m", cyan: "\x1b[36m", lime: "\x1b[32m", orange: "\x1b[33m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

async function main() {
  if (!process.env.NEBIUS_API_KEY) {
    console.error("❌ NEBIUS_API_KEY missing");
    process.exit(1);
  }
  const openai = new OpenAI({
    apiKey: process.env.NEBIUS_API_KEY,
    baseURL: process.env.NEBIUS_BASE_URL ?? "https://api.studio.nebius.com/v1/",
  });
  const model = process.env.NEBIUS_MODEL ?? "Qwen/Qwen3-235B-A22B-Instruct-2507";
  const store = new AlertStore();

  console.log(`\n◆ ORACLE ARENA · v2 live session`);
  console.log(`  model: ${model}`);
  console.log(`  min_interest: ${minInterest}`);
  console.log(`  analysts: ${ANALYSTS.map((a) => a.name).join(", ")}`);
  console.log(`  ${runSeconds > 0 ? `will stop after ${runSeconds}s` : "ctrl+c to stop"}\n`);

  // Seed with top-interest signals first so we have something to react to immediately,
  // then switch to streaming.
  console.log(`→ loading seed batch of top-interest signals...`);
  const seed = await queryFeed({ sort: "interest", limit: 6 });
  const seedSignals = seed.results.filter((s) => (s.question.interest_score ?? 0) >= minInterest);
  console.log(`   ${seedSignals.length} signals ≥ ${minInterest}/10 loaded\n`);

  const stop = runSeconds > 0 ? Date.now() + runSeconds * 1000 : Infinity;

  async function handle(signal: (typeof seed.results)[number]) {
    console.log(
      `\n${DIM}─── signal${RESET} ${signal.signal_hash.slice(0, 10)}  ${signal.question.category}  i=${signal.question.interest_score}\n  Q: ${signal.question.text}`,
    );
    const alerts = await Promise.all(
      ANALYSTS.map((p) =>
        analyzeSignal(p, signal, openai, model).then(
          (a) => ({ profile: p, alert: a } as const),
        ),
      ),
    );
    for (const { profile, alert } of alerts) {
      const c = COLOR[profile.color] ?? "";
      if (!alert) {
        console.log(`  ${c}${profile.name.padEnd(6)}${RESET} ${DIM}skipped (out of beat)${RESET}`);
        continue;
      }
      store.save(alert);
      const emoji = alert.verdict === "YES" ? "✓" : "✗";
      console.log(
        `  ${c}${profile.name.padEnd(6)}${RESET} ${emoji} ${alert.verdict.padEnd(3)} conf ${(alert.confidence * 100).toFixed(0).padStart(3)}%  ${DIM}→${RESET} ${alert.tldr}`,
      );
    }
  }

  for (const s of seedSignals) {
    if (Date.now() > stop) break;
    await handle(s);
  }

  if (Date.now() < stop) {
    console.log(`\n${DIM}─── watching for new signals...${RESET}\n`);
    const stream = streamNewSignals(
      { sort: "recent", limit: 50, min_interest: minInterest, exclude_user_source: true },
      15_000,
    );
    for await (const sig of stream) {
      if (Date.now() > stop) break;
      await handle(sig);
    }
  }

  // Summary
  console.log(`\n${DIM}─── session end${RESET}`);
  const stats = store.countByAnalyst();
  for (const row of stats) {
    console.log(
      `  ${row.analyst.padEnd(6)}  ${String(row.alerts).padStart(3)} alerts  avg conf ${(row.avg_confidence * 100).toFixed(0)}%`,
    );
  }
  store.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
