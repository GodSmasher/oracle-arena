/**
 * Smoke test: run one agent (Alice) on a single question.
 *
 * Needs:
 *   - NEBIUS_API_KEY in .env
 *   - Alice funded with Sepolia ETH and USDC (see `npm run balance`)
 *
 * Run: npm run agent
 *   or: npm run agent -- "Will BTC close above $120k today?"
 */
import "dotenv/config";
import OpenAI from "openai";
import type { Hex } from "viem";
import { runAgent } from "../src/agents/agent.ts";
import { listIntents } from "../src/telegraph/client.ts";

const question = process.argv[2] ?? "What is the current price of Bitcoin in USD?";

async function main() {
  if (!process.env.NEBIUS_API_KEY) {
    console.error("❌ NEBIUS_API_KEY missing in .env");
    process.exit(1);
  }
  if (!process.env.AGENT_ALICE_PK) {
    console.error("❌ AGENT_ALICE_PK missing in .env — run `npm run wallet` first");
    process.exit(1);
  }

  const openai = new OpenAI({
    apiKey: process.env.NEBIUS_API_KEY,
    baseURL: process.env.NEBIUS_BASE_URL ?? "https://api.studio.nebius.com/v1/",
  });
  const model = process.env.NEBIUS_MODEL ?? "deepseek-ai/DeepSeek-V3";

  console.log(`📚 Loading intent catalogue...`);
  const intents = await listIntents();
  const intentNames = intents.map((i) => String(i.intent_name ?? i.name));
  console.log(`   ${intentNames.length} canonical intents available`);

  console.log(`\n🎮 ROUND START`);
  console.log(`   Question: ${question}`);
  console.log(`   Agent: ALICE on ${model}`);
  console.log(`   Budget: $0.50 USDC · max 5 purchases\n`);

  const { bid, receipts, spent } = await runAgent(
    {
      name: "ALICE",
      pk: process.env.AGENT_ALICE_PK as Hex,
      personality:
        "Decisive and data-driven. Prefers on-chain and market sources over social signals. Won't waste budget on obvious questions.",
      budgetUsd: 0.5,
      maxPurchases: 5,
    },
    question,
    intentNames,
    openai,
    model,
  );

  console.log("\n📜 RECEIPTS");
  for (const r of receipts) {
    const t = new Date(r.ts).toISOString().split("T")[1]!.slice(0, 8);
    const tag = r.action.toUpperCase().padEnd(5);
    const line = [tag, r.intent ?? "", r.cost_usd ? `$${r.cost_usd.toFixed(4)}` : "", r.note ?? ""]
      .filter(Boolean)
      .join("  ");
    console.log(`  [${t}] ${line}`);
  }

  console.log(`\n💸 Spent: $${spent.toFixed(4)} USDC`);

  if (bid) {
    console.log(`\n🏁 BID`);
    console.log(`   Answer:     ${bid.answer}`);
    console.log(`   Confidence: ${(bid.confidence * 100).toFixed(0)}%`);
    console.log(`   Reasoning:  ${bid.reasoning}`);
  } else {
    console.log(`\n⚠️  No bid placed (agent ran out of turns)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
