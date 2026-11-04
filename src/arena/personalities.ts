/**
 * The 4 agents' personalities — distinct voices + distinct preferred sources
 * so their strategies diverge and the live scene stays entertaining to watch.
 */
import type { Hex } from "viem";

export interface AgentProfile {
  name: string;
  pk: Hex;
  personality: string;
  color: string;           // for the frontend sprite
  intentHints: string[];   // intent families this agent leans on (soft bias, not a lock)
}

export function buildRoster(env: NodeJS.ProcessEnv): AgentProfile[] {
  return [
    {
      name: "ALICE",
      pk: env.AGENT_ALICE_PK as Hex,
      color: "magenta",
      personality:
        "Decisive market quant. Prefers hard numbers from price feeds and financial data. Bids fast when the data is clean. Dislikes vague opinions.",
      intentHints: [
        "CRYPTO_PRICE_USD",
        "FINANCIAL_DATA_GENERAL",
        "CURRENCY_EXCHANGE_CONVERT",
        "ASSET_RESERVE_ATTESTATION_GENERAL",
      ],
    },
    {
      name: "BOB",
      pk: env.AGENT_BOB_PK as Hex,
      color: "cyan",
      personality:
        "Cautious researcher. Triangulates two or three sources before bidding. Calibrates confidence carefully — never overclaims. Treats on-chain data as ground truth where available.",
      intentHints: [
        "CROSS_CHAIN_STATE_VERIFY_GENERAL",
        "CRYPTO_TRANSFER_VERIFY_GENERAL",
        "FACT_CHECK_GENERAL",
        "CODE_PATCH_VERIFY_GENERAL",
      ],
    },
    {
      name: "CARL",
      pk: env.AGENT_CARL_PK as Hex,
      color: "lime",
      personality:
        "Fast and cheap. Buys at most one piece of evidence and bids quickly. Prefers aggregate sources like news and sentiment that cover lots of ground per request.",
      intentHints: [
        "NEWS_AGGREGATE_GENERAL",
        "SENTIMENT_ANALYSIS_GENERAL",
        "EVENT_OUTCOME_RESOLUTION_GENERAL",
        "CHAT_COMPLETION_GENERAL",
      ],
    },
    {
      name: "DANA",
      pk: env.AGENT_DANA_PK as Hex,
      color: "orange",
      personality:
        "Contrarian. Looks for edges in off-the-wall sources: deepfake checks, academic literature, weather and air quality. Willing to bid against the crowd when the evidence points sideways.",
      intentHints: [
        "DEEPFAKE_DETECTION_GENERAL",
        "ACADEMIC_SEARCH_GENERAL",
        "CONTENT_VERIFICATION_GENERAL",
        "AIR_QUALITY_INDEX_GENERAL",
        "WEATHER_FORECAST_GENERAL",
      ],
    },
  ];
}
