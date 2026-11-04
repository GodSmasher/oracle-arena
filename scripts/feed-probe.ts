/**
 * Dump the latest 20 signals from the Daemon feed as a quick sanity check.
 * Run: npx tsx scripts/feed-probe.ts
 */
import "dotenv/config";
import { queryFeed, listCategories } from "../src/telegraph/daemon.ts";

async function main() {
  console.log("→ listing categories...");
  try {
    const cats = await listCategories();
    console.log("  found", cats.length, "categories");
    console.log("  first 3:", cats.slice(0, 3));
  } catch (e) {
    console.error("  failed:", (e as Error).message);
  }

  console.log("\n→ recent feed (last 10, keep ALL sources)...");
  const feed = await queryFeed({ sort: "recent", limit: 10 });
  console.log(`  total available: ${feed.total}`);
  for (const r of feed.results.slice(0, 10)) {
    const src = (r.source ?? "?").padEnd(20);
    console.log(
      `  [${new Date(r.created_at).toISOString().slice(11, 19)}] ${String(r.question.category).padEnd(10)} i=${r.question.interest_score}  src=${src}  ${r.question.text.slice(0, 80)}`,
    );
  }

  console.log("\n→ unique sources in last 100 recent...");
  const page = await queryFeed({ sort: "recent", limit: 100 });
  const counts = new Map<string, number>();
  for (const r of page.results) counts.set(r.source ?? "?", (counts.get(r.source ?? "?") ?? 0) + 1);
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  console.log("\n→ top-interest signals (daemon-produced prediction questions)...");
  const top = await queryFeed({ sort: "interest", limit: 20 });
  const topSources = new Map<string, number>();
  for (const r of top.results) topSources.set(r.source ?? "?", (topSources.get(r.source ?? "?") ?? 0) + 1);
  console.log("  top-interest source breakdown:");
  for (const [k, v] of [...topSources.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(3)}  ${k}`);
  }
  console.log("\n  first 10 top-interest signals:");
  for (const r of top.results.slice(0, 10)) {
    console.log(
      `  i=${r.question.interest_score}  ${String(r.question.category).padEnd(10)}  [${(r.source ?? "?").slice(0, 32).padEnd(32)}]  ${r.question.text.slice(0, 80)}`,
    );
  }

  console.log("\n→ example high-interest signal with full execution result...");
  const ex = top.results[0];
  if (ex) {
    console.log(`  signal_hash: ${ex.signal_hash}`);
    console.log(`  question:    ${ex.question.text}`);
    console.log(`  category:    ${ex.question.category}`);
    console.log(`  source:      ${ex.source}`);
    console.log(`  intent:      ${ex.routing.intent}`);
    console.log(`  miner:       ${ex.routing.subnet_name} (${ex.routing.miner_slug})`);
    console.log(`  cost:        $${ex.execution.cost_usd ?? 0}`);
    console.log(`  result:      ${JSON.stringify(ex.execution.result).slice(0, 300)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
