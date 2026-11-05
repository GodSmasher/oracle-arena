/**
 * Record ground truth for questions the analysts have called.
 *
 * Usage:
 *   npm run resolve                 # list unresolved questions
 *   npm run resolve -- <key> YES    # mark that question as YES
 *   npm run resolve -- <key> NO
 *   npm run resolve -- <key> YES "reason/notes"
 *
 * The <key> can be the full question_key or any unique prefix of it.
 * The resolution applies to every alert across all 4 analysts that targeted
 * the same normalized question.
 */
import "dotenv/config";
import { AlertStore } from "../src/storage/alerts.ts";

const store = new AlertStore();
const args = process.argv.slice(2);

if (args.length === 0) {
  const pending = store.pendingQuestions(30);
  if (pending.length === 0) {
    console.log("Nothing pending — every alerted question has a resolution.");
    process.exit(0);
  }
  console.log(`\n◆ Pending questions (${pending.length} unresolved)\n`);
  console.log("ALERTS  CATEGORY    QUESTION  (key prefix)");
  console.log("─".repeat(100));
  for (const p of pending) {
    console.log(
      `${String(p.alerts).padStart(6)}  ${String(p.category).padEnd(10)}  ${p.question.slice(0, 55).padEnd(55)}  [${p.question_key.slice(0, 30)}...]`,
    );
  }
  console.log(`\nTo resolve one:  npm run resolve -- "<key prefix>" YES|NO ["notes"]`);
  store.close();
  process.exit(0);
}

const [keyArg, outcomeArg, notes] = args;
if (!keyArg || !outcomeArg) {
  console.error("Usage: npm run resolve -- <key-prefix> YES|NO [\"notes\"]");
  process.exit(1);
}
const outcome = outcomeArg.toUpperCase();
if (outcome !== "YES" && outcome !== "NO") {
  console.error(`outcome must be YES or NO, got '${outcomeArg}'`);
  process.exit(1);
}

// Resolve a prefix to the full key by scanning pending + all alerts
const pending = store.pendingQuestions(500);
const match = pending.find((p) => p.question_key.startsWith(keyArg.toLowerCase()));
if (!match) {
  console.error(`No pending question matches prefix '${keyArg}'.`);
  console.error("Run `npm run resolve` to list pending questions.");
  process.exit(1);
}

const n = store.resolve({
  question_key: match.question_key,
  outcome: outcome as "YES" | "NO",
  resolved_at: Date.now(),
  source: "manual",
  notes,
});
console.log(`✅ Resolved '${match.question.slice(0, 80)}' as ${outcome}`);
console.log(`   ${n} alert${n === 1 ? "" : "s"} across all analysts now scored against this truth`);
store.close();
