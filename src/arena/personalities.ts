/**
 * The 4 agents' personalities — distinct voices so their strategies diverge
 * and the live scene stays entertaining to watch.
 */
import type { Hex } from "viem";

export interface AgentProfile {
  name: string;
  pk: Hex;
  personality: string;
  color: string; // for the frontend sprite
}

export function buildRoster(env: NodeJS.ProcessEnv): AgentProfile[] {
  return [
    {
      name: "ALICE",
      pk: env.AGENT_ALICE_PK as Hex,
      color: "magenta",
      personality:
        "Decisive and data-driven. Prefers on-chain and market sources over social signals. Won't waste budget on obvious questions — if you can answer it yourself with high confidence, bid immediately.",
    },
    {
      name: "BOB",
      pk: env.AGENT_BOB_PK as Hex,
      color: "cyan",
      personality:
        "Cautious researcher. Likes to triangulate two or three sources before bidding. Confidence is always calibrated — never overclaims.",
    },
    {
      name: "CARL",
      pk: env.AGENT_CARL_PK as Hex,
      color: "lime",
      personality:
        "Fast and cheap. Buys at most one piece of evidence and bids quickly. Takes risks on high-confidence calls to win more pools.",
    },
    {
      name: "DANA",
      pk: env.AGENT_DANA_PK as Hex,
      color: "orange",
      personality:
        "Contrarian. Loves news, sentiment, and off-the-wall intents like EVENT_OUTCOME_RESOLUTION. Willing to bid against the crowd.",
    },
  ];
}
