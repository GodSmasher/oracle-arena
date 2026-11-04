/**
 * Orchestrate a full Oracle Arena round:
 *   1. Load the 4 agents
 *   2. Run them in parallel against the same question
 *   3. Collect bids + receipts
 *   4. Judge decides winner
 *   5. Emit a Verdict
 */
import OpenAI from "openai";
import { runAgent, type Receipt, type Bid } from "../agents/agent.ts";
import { buildRoster, type AgentProfile } from "./personalities.ts";
import { judge, type Verdict } from "../judge/judge.ts";

export interface AgentRunResult {
  profile: AgentProfile;
  bid: Bid | null;
  receipts: Receipt[];
  spent: number;
}

export interface RoundResult {
  question: string;
  truth: string;
  pool: number;
  runs: AgentRunResult[];
  verdict: Verdict;
  startedAt: number;
  finishedAt: number;
}

export interface RoundConfig {
  question: string;
  truth: string;              // for off-chain MVP judging
  pool: number;               // TGP, display-only
  budgetUsd: number;          // per agent
  maxPurchases: number;       // per agent
  intentNames: string[];
  openai: OpenAI;
  model: string;
}

export async function runRound(cfg: RoundConfig): Promise<RoundResult> {
  const startedAt = Date.now();
  const roster = buildRoster(process.env);

  // Fan out: all 4 agents run in parallel
  const runs = await Promise.all(
    roster.map(async (profile): Promise<AgentRunResult> => {
      const { bid, receipts, spent } = await runAgent(
        {
          name: profile.name,
          pk: profile.pk,
          personality: profile.personality,
          budgetUsd: cfg.budgetUsd,
          maxPurchases: cfg.maxPurchases,
        },
        cfg.question,
        cfg.intentNames,
        cfg.openai,
        cfg.model,
      );
      return { profile, bid, receipts, spent };
    }),
  );

  // Judge
  const bidsForJudge = runs
    .filter((r) => r.bid !== null)
    .map((r) => ({ agent: r.profile.name, bid: r.bid! }));
  const verdict = judge(cfg.question, cfg.truth, cfg.pool, bidsForJudge);

  return {
    question: cfg.question,
    truth: cfg.truth,
    pool: cfg.pool,
    runs,
    verdict,
    startedAt,
    finishedAt: Date.now(),
  };
}
