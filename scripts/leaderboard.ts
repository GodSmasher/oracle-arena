/**
 * Prints an analyst leaderboard from the alerts table.
 * This is the raw input for the subscription product: users see which analyst
 * has published how much, in which categories, at what calibration.
 *
 * Run: npm run leaderboard
 *      npm run leaderboard -- 50   (show last 50 alerts per analyst)
 */
import "dotenv/config";
import { AlertStore } from "../src/storage/alerts.ts";

const perAnalyst = Number(process.argv[2] ?? 10);

const store = new AlertStore();
const stats = store.countByAnalyst();

if (stats.length === 0) {
  console.log("No alerts yet — run `npm run session` first.");
  process.exit(0);
}

console.log(`\n◆ ORACLE ARENA · analyst leaderboard\n`);
console.log("ANALYST  ALERTS  AVG CONF");
console.log("─".repeat(30));
for (const s of stats) {
  console.log(
    `${s.analyst.padEnd(7)} ${String(s.alerts).padStart(6)}  ${(s.avg_confidence * 100).toFixed(0).padStart(5)}%`,
  );
}

console.log(`\n── latest alerts per analyst (up to ${perAnalyst}) ──`);
for (const s of stats) {
  console.log(`\n${s.analyst}:`);
  const rows = store.recent(perAnalyst, s.analyst);
  for (const r of rows) {
    const t = new Date(Number(r.ts)).toISOString().slice(5, 16).replace("T", " ");
    const emoji = r.verdict === "YES" ? "✓" : r.verdict === "NO" ? "✗" : "·";
    console.log(
      `  [${t}] ${emoji} ${String(r.verdict).padEnd(3)} conf ${(Number(r.confidence) * 100).toFixed(0).padStart(3)}%  ${String(r.category).padEnd(10)}  ${String(r.tldr).slice(0, 80)}`,
    );
  }
}

store.close();
