/**
 * Dry-run the judge with fake bids to validate distance + winner logic.
 * No Telegraph calls, no Nebius calls, no gas.
 *
 * Run: npx tsx scripts/test-judge.ts
 */
import { judge } from "../src/judge/judge.ts";

console.log("── YES/NO case ──");
console.log(
  judge("Will BTC close above $120k today?", "NO", 500, [
    { agent: "ALICE", bid: { answer: "NO", confidence: 0.84, reasoning: "price is 112k, not likely to spike 7% in 6h" } },
    { agent: "BOB",   bid: { answer: "NO", confidence: 0.72, reasoning: "low volume on spot" } },
    { agent: "CARL",  bid: { answer: "YES", confidence: 0.60, reasoning: "hunch on CPI print" } },
    { agent: "DANA",  bid: { answer: "YES", confidence: 0.95, reasoning: "whale buy signal" } },
  ]),
);

console.log("\n── numeric case ──");
console.log(
  judge("BTC price in USD", "112483", 500, [
    { agent: "ALICE", bid: { answer: "112500", confidence: 0.92, reasoning: "" } },
    { agent: "BOB",   bid: { answer: "112200", confidence: 0.85, reasoning: "" } },
    { agent: "CARL",  bid: { answer: "95000",  confidence: 0.50, reasoning: "" } },
    { agent: "DANA",  bid: { answer: "150000", confidence: 0.99, reasoning: "" } },
  ]),
);

console.log("\n── all wrong case ──");
console.log(
  judge("Who won the Nobel Prize in Physics 2026?", "John Smith", 500, [
    { agent: "ALICE", bid: { answer: "Albert Einstein", confidence: 0.3, reasoning: "" } },
    { agent: "BOB",   bid: { answer: "Marie Curie",     confidence: 0.4, reasoning: "" } },
    { agent: "CARL",  bid: { answer: "Richard Feynman", confidence: 0.2, reasoning: "" } },
    { agent: "DANA",  bid: { answer: "no idea",         confidence: 0.1, reasoning: "" } },
  ]),
);
