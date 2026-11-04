/**
 * Full Oracle Arena round: 4 agents, 1 question, 1 judge.
 *
 * Usage:
 *   npm run round
 *   npm run round -- "Will BTC close above $120k today?" "NO"
 *
 * All 4 agent wallets must be funded with Sepolia ETH + USDC.
 */
import "dotenv/config";
import OpenAI from "openai";
import { listIntents } from "../src/telegraph/client.ts";
import { runRound } from "../src/arena/round.ts";
import { Store } from "../src/storage/db.ts";

const question = process.argv[2] ?? "What is the current price of Bitcoin in USD?";
const truth = process.argv[3] ?? "unknown";

const COLOR_CODES: Record<string, string> = {
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  lime: "\x1b[32m",
  orange: "\x1b[33m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

async function main() {
  if (!process.env.NEBIUS_API_KEY) {
    console.error("❌ NEBIUS_API_KEY missing in .env");
    process.exit(1);
  }

  const openai = new OpenAI({
    apiKey: process.env.NEBIUS_API_KEY,
    baseURL: process.env.NEBIUS_BASE_URL ?? "https://api.studio.nebius.com/v1/",
  });
  const model = process.env.NEBIUS_MODEL ?? "Qwen/Qwen3-235B-A22B-Instruct-2507";

  console.log(`\n◆ ORACLE ARENA · ROUND OPEN`);
  console.log(`  Model: ${model}`);
  console.log(`  Question: ${question}`);
  console.log(`  Truth:    ${truth === "unknown" ? "(not provided — no winner will be declared)" : truth}`);
  console.log(`  Pool:     500 TGP\n`);

  console.log(`📚 Loading intent catalogue...`);
  const intents = await listIntents();
  const intentNames = intents.map((i) => String(i.intent_name ?? i.name));
  console.log(`   ${intentNames.length} canonical intents available\n`);

  console.log(`🏃 All 4 agents running in parallel...\n`);

  const result = await runRound({
    question,
    truth,
    pool: 500,
    budgetUsd: 0.5,
    maxPurchases: 5,
    intentNames,
    openai,
    model,
  });

  // Per-agent receipts
  for (const run of result.runs) {
    const color = COLOR_CODES[run.profile.color] ?? "";
    console.log(`\n${color}━━━ ${run.profile.name} ━━━${RESET}`);
    for (const r of run.receipts) {
      const t = new Date(r.ts).toISOString().split("T")[1]!.slice(0, 8);
      const tag = r.action.toUpperCase().padEnd(5);
      console.log(
        `  ${DIM}[${t}]${RESET} ${color}${tag}${RESET}  ${r.intent ?? ""} ${r.cost_usd ? "$" + r.cost_usd.toFixed(4) : ""}  ${DIM}${r.note?.slice(0, 100) ?? ""}${RESET}`,
      );
    }
    if (run.bid) {
      console.log(
        `  ${color}▸ BID: ${run.bid.answer} (conf ${(run.bid.confidence * 100).toFixed(0)}%)${RESET}  spent $${run.spent.toFixed(4)}`,
      );
    } else {
      console.log(`  ⚠️  no bid`);
    }
  }

  // Verdict
  console.log(`\n⚖  JUDGE`);
  console.log(`  ${result.verdict.reasoning}`);
  if (result.verdict.winner) {
    console.log(`\n🏆 WINNER: ${result.verdict.winner}  (+${result.verdict.pool} TGP)`);
  } else {
    console.log(`\n⏭  No winner this round`);
  }

  console.log(`\n⏱  Round took ${((result.finishedAt - result.startedAt) / 1000).toFixed(1)}s`);
  console.log(
    `💰 Total spent: $${result.runs.reduce((s, r) => s + r.spent, 0).toFixed(4)} USDC across all agents`,
  );

  // Persist
  const store = new Store();
  const roundId = store.saveRound(result);
  store.close();
  console.log(`\n💾 Saved as round #${roundId} in data/oracle-arena.db`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
