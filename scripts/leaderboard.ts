/**
 * Analyst leaderboard: alerts, hit rate on resolved questions, Brier score.
 *
 * Run: npm run leaderboard
 *      npm run leaderboard -- 10   (show last 10 alerts per analyst)
 */
import "dotenv/config";
import { AlertStore } from "../src/storage/alerts.ts";

const perAnalyst = Number(process.argv[2] ?? 8);

const store = new AlertStore();
const scores = store.scores();

if (scores.length === 0) {
  console.log("No alerts yet — run `npm run session` first.");
  process.exit(0);
}

console.log(`\n◆ ORACLE ARENA · analyst leaderboard\n`);
console.log("ANALYST  ALERTS  RESOLVED  HITS   HIT-RATE  BRIER   AVG CONF");
console.log("─".repeat(65));
for (const s of scores) {
  const hitRate = s.resolved > 0 ? `${(s.hit_rate * 100).toFixed(0).padStart(3)}%` : "  — ";
  const brier = s.resolved > 0 ? s.brier.toFixed(3) : "  — ";
  console.log(
    `${s.analyst.padEnd(7)} ${String(s.alerts).padStart(6)}  ${String(s.resolved).padStart(8)}  ${String(s.hits).padStart(4)}   ${hitRate.padStart(7)}  ${brier.padStart(5)}  ${(s.avg_confidence * 100).toFixed(0).padStart(4)}%`,
  );
}

console.log(`
Note: Brier score is the mean squared error between confidence and outcome.
      Lower is better. 0 = perfect calibration + always right.
      0.25 = coin-flip or uncalibrated.
`);

console.log(`── latest ${perAnalyst} alerts per analyst ──`);
for (const s of scores) {
  console.log(`\n${s.analyst}:`);
  const rows = store.recent(perAnalyst, s.analyst);
  for (const r of rows) {
    const t = new Date(Number(r.ts)).toISOString().slice(5, 16).replace("T", " ");
    const emoji = r.verdict === "YES" ? "✓" : "✗";
    console.log(
      `  [${t}] ${emoji} ${String(r.verdict).padEnd(3)} conf ${(Number(r.confidence) * 100).toFixed(0).padStart(3)}%  ${String(r.category).padEnd(10)}  ${String(r.tldr).slice(0, 80)}`,
    );
  }
}

store.close();
