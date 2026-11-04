/**
 * Smoke test: hit /v1/ask without payment to see the 402 Payment Required flow.
 * This validates our wiring and shows what x402 wants next.
 *
 * Run: npm run ask
 */
import "dotenv/config";
import { request } from "undici";

const ENGINE = process.env.TELEGRAPH_ENGINE_URL ?? "https://devnode.telegraphprotocol.com/engine";

async function main() {
  const { statusCode, headers, body } = await request(`${ENGINE}/v1/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "What is the current BTC price in USD?" }),
  });

  const text = await body.text();
  console.log(`Status: ${statusCode}`);
  console.log(`Headers:`, headers);
  console.log(`Body:`, text);

  if (statusCode === 402) {
    console.log("\n→ 402 as expected. Payment path visible above.");
    console.log("  Next: implement x402 payment signature OR use escrow prefunding.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
