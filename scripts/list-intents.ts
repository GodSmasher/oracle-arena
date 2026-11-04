/**
 * Fetch the live intent catalogue from Telegraph.
 * This is a FREE call — no payment needed.
 *
 * Run: npm run intents
 */
import "dotenv/config";
import { request } from "undici";

const ENGINE = process.env.TELEGRAPH_ENGINE_URL ?? "https://devnode.telegraphprotocol.com/engine";

async function main() {
  const { statusCode, body } = await request(`${ENGINE}/v1/intents`);
  if (statusCode !== 200) {
    console.error(`HTTP ${statusCode}`);
    process.exit(1);
  }
  const data = (await body.json()) as { intents: Array<Record<string, unknown>> };

  const canonical = data.intents.filter(
    (i) => i.canonical === true && typeof i.miner_count === "number" && (i.miner_count as number) > 0,
  );

  console.log(`Total intents: ${data.intents.length}`);
  console.log(`Canonical + live (miner_count > 0): ${canonical.length}\n`);

  for (const intent of canonical.slice(0, 40)) {
    const name = intent.intent_name ?? intent.name;
    const desc = (intent.description as string | undefined)?.slice(0, 80) ?? "";
    const miners = intent.miner_count;
    console.log(`  ${String(name).padEnd(40)} (${miners} miners)  ${desc}`);
  }
  if (canonical.length > 40) console.log(`\n  ... and ${canonical.length - 40} more`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
