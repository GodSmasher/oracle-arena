/**
 * Minimal Judge: given the 4 bids and the ground-truth answer,
 * pick a winner and compute payouts.
 *
 * For MVP this is off-chain (no smart contract yet). The output can later
 * be fed to a Solidity settlement module.
 */
import type { Bid } from "../agents/agent.ts";

export interface JudgedBid {
  agent: string;
  bid: Bid;
  distance: number;   // 0 = perfect, 1 = completely wrong
  penalty: number;    // confidence × distance — overconfident wrong bids lose more
  reward: number;     // share of the pool
}

export interface Verdict {
  question: string;
  truth: string;
  winner: string | null;
  pool: number;
  judged: JudgedBid[];
  reasoning: string;
}

/**
 * Normalize an answer: strip punctuation, lowercase, short-form.
 */
function normalize(s: unknown): string {
  return String(s)
    .toLowerCase()
    .replace(/[,!?'"`]/g, "") // keep the decimal dot!
    .trim();
}

/**
 * Distance between two answers.
 *   YES/NO: exact match → 0, otherwise 1
 *   Numeric: relative error, clamped [0,1]
 *   String: Jaccard on token sets, inverted
 */
function distance(answer: string, truth: string): number {
  const a = normalize(answer);
  const t = normalize(truth);

  // YES/NO
  const yesNo = new Set(["yes", "y", "true", "no", "n", "false"]);
  if (yesNo.has(a) && yesNo.has(t)) {
    const aBool = ["yes", "y", "true"].includes(a);
    const tBool = ["yes", "y", "true"].includes(t);
    return aBool === tBool ? 0 : 1;
  }

  // Numeric
  const aNum = parseFloat(a.replace(/[^0-9.\-]/g, ""));
  const tNum = parseFloat(t.replace(/[^0-9.\-]/g, ""));
  if (!isNaN(aNum) && !isNaN(tNum) && tNum !== 0) {
    const rel = Math.abs(aNum - tNum) / Math.abs(tNum);
    return Math.min(1, rel);
  }

  // Jaccard on tokens
  const aTok = new Set(a.split(/\s+/).filter(Boolean));
  const tTok = new Set(t.split(/\s+/).filter(Boolean));
  if (aTok.size === 0 || tTok.size === 0) return 1;
  const inter = new Set([...aTok].filter((x) => tTok.has(x))).size;
  const union = new Set([...aTok, ...tTok]).size;
  return 1 - inter / union;
}

export function judge(
  question: string,
  truth: string,
  pool: number,
  bids: Array<{ agent: string; bid: Bid }>,
): Verdict {
  const judged: JudgedBid[] = bids.map(({ agent, bid }) => {
    const d = distance(bid.answer, truth);
    return {
      agent,
      bid,
      distance: d,
      penalty: d * bid.confidence,
      reward: 0,
    };
  });

  // Winner = lowest distance, tie-broken by highest confidence
  const sorted = [...judged].sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return b.bid.confidence - a.bid.confidence;
  });

  const best = sorted[0]!;
  const winner = best.distance <= 0.2 ? best.agent : null; // >20% off = no winner

  if (winner) {
    const w = judged.find((j) => j.agent === winner)!;
    w.reward = pool;
  }

  return {
    question,
    truth,
    winner,
    pool,
    judged,
    reasoning: winner
      ? `${winner} answered "${best.bid.answer}" (distance ${best.distance.toFixed(2)} from truth "${truth}"). Pool of ${pool} TGP paid out.`
      : `No winner — best distance ${best.distance.toFixed(2)} exceeded 0.2 threshold. Pool rolls over.`,
  };
}
