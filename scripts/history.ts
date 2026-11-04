/**
 * Print recent rounds from the SQLite store.
 * Run: npm run history
 *      npm run history -- 20   (last 20)
 *      npm run history -- 5 detail   (last 5 with full receipts)
 */
import "dotenv/config";
import { Store } from "../src/storage/db.ts";

const limit = Number(process.argv[2] ?? 10);
const detail = process.argv[3] === "detail";

const store = new Store();
const rows = store.recent(limit);

if (rows.length === 0) {
  console.log("No rounds yet — run `npm run round` first.");
  process.exit(0);
}

console.log(`\n◆ ORACLE ARENA · last ${rows.length} rounds\n`);
console.log("ID   WHEN              WINNER  POOL   SPENT     Q");
console.log("─".repeat(100));
for (const r of rows) {
  const when = new Date(Number(r.finished_at)).toISOString().replace("T", " ").slice(5, 16);
  const winner = (r.winner as string | null) ?? "—".padEnd(6);
  const spent = `$${Number(r.total_spent_usd ?? 0).toFixed(4)}`;
  const q = String(r.question).slice(0, 60);
  console.log(
    `${String(r.id).padEnd(4)} ${when}  ${winner.padEnd(6)}  ${String(r.pool).padEnd(4)}   ${spent.padEnd(8)} ${q}`,
  );
}

if (detail) {
  for (const row of rows) {
    const d = store.roundDetail(Number(row.id));
    console.log(`\n─── round #${row.id} ───`);
    console.log("bids:");
    for (const b of d.bids as Array<Record<string, unknown>>) {
      console.log(
        `  ${String(b.agent).padEnd(6)} ${String(b.answer).padEnd(14)} conf ${b.confidence}  dist ${
          b.distance != null ? Number(b.distance).toFixed(3) : "-"
        }  reward ${b.reward}`,
      );
    }
    console.log("receipts:");
    for (const r of d.receipts as Array<Record<string, unknown>>) {
      const t = new Date(Number(r.ts)).toISOString().split("T")[1]!.slice(0, 8);
      console.log(
        `  [${t}] ${String(r.agent).padEnd(6)} ${String(r.action).padEnd(5)} ${(r.intent as string) ?? ""} ${
          r.cost_usd ? "$" + r.cost_usd : ""
        }  ${String(r.note ?? "").slice(0, 80)}`,
      );
    }
  }
}

store.close();
