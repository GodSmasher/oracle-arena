/**
 * Demo: live-tail the Telegraph Daemon Feed.
 * Prints each new signal as it appears, color-coded by category.
 *
 * Run: npm run stream
 *      npm run stream -- CRYPTO       # filter to one category
 *      npm run stream -- "" 5         # no filter, min_interest 5
 */
import "dotenv/config";
import { streamNewSignals } from "../src/telegraph/daemon.ts";

const category = process.argv[2] || undefined;
const minInterest = process.argv[3] ? Number(process.argv[3]) : undefined;

const CAT_COLOR: Record<string, string> = {
  FINANCE: "\x1b[32m", CRYPTO: "\x1b[33m", POLITICS: "\x1b[35m",
  GEOPOLITICS: "\x1b[31m", TECHNOLOGY: "\x1b[36m", CLIMATE: "\x1b[34m",
  HEALTH: "\x1b[91m", LAW: "\x1b[93m", AI: "\x1b[95m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

async function main() {
  console.log(`\n◆ TELEGRAPH DAEMON FEED · live tail`);
  console.log(`  category: ${category ?? "ALL"}  min_interest: ${minInterest ?? "0"}`);
  console.log(`  polling every 10s, ctrl+c to stop\n`);

  const stream = streamNewSignals(
    {
      category: category as never,
      min_interest: minInterest,
      sort: "recent",
      limit: 50,
      exclude_user_source: true,
    },
    10_000,
  );

  for await (const sig of stream) {
    const t = new Date(sig.created_at).toISOString().split("T")[1]!.slice(0, 8);
    const cat = String(sig.question.category || "???").padEnd(10);
    const color = CAT_COLOR[sig.question.category as string] ?? "";
    const score = sig.question.interest_score ?? 0;
    const intent = (sig.routing.intent ?? "?").padEnd(32);
    const miner = sig.routing.miner_slug ?? sig.routing.subnet_name ?? "?";
    const q = sig.question.text.slice(0, 80);
    console.log(
      `${DIM}[${t}]${RESET} ${color}${cat}${RESET} i=${score}  ${DIM}${intent}${RESET} ${DIM}${miner}${RESET}  ${q}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
