/**
 * Smoke test: hit Nebius, confirm the key works, list a couple of available models.
 * Run: npx tsx scripts/test-nebius.ts
 */
import "dotenv/config";
import OpenAI from "openai";

async function main() {
  const client = new OpenAI({
    apiKey: process.env.NEBIUS_API_KEY,
    baseURL: process.env.NEBIUS_BASE_URL ?? "https://api.studio.nebius.com/v1/",
  });

  console.log("→ Listing available models...");
  const models = await client.models.list();
  const ids = [...models.data].map((m) => m.id).sort();
  console.log(`   ${ids.length} models available. First 15:`);
  for (const id of ids.slice(0, 15)) console.log(`     ${id}`);

  const model = process.env.NEBIUS_MODEL ?? "deepseek-ai/DeepSeek-V3";
  console.log(`\n→ Testing chat.completions with model: ${model}`);
  const r = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You answer in exactly one word." },
      { role: "user", content: "What color is the sky on a clear day?" },
    ],
    max_tokens: 20,
  });
  console.log(`   Response: ${r.choices[0]?.message.content}`);
  console.log(`   Tokens: ${r.usage?.total_tokens}`);

  console.log("\n✅ Nebius is wired up.");
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
