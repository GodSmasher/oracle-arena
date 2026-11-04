/**
 * Analyst v2 — reads Daemon-produced prediction questions + their miner
 * responses, then publishes its own calibrated prediction as an Alert.
 *
 * Difference vs. v1 Agent:
 *   - Doesn't buy intelligence per question (that was $0.12/decision)
 *   - Reads the free Daemon feed instead; miner-produced answers come with it
 *   - Each analyst has a beat (category + style) so verdicts diverge
 *   - Output is an Alert (signed prediction), not a round-bid
 */
import OpenAI from "openai";
import type { Signal } from "../telegraph/daemon.ts";

export interface Alert {
  ts: number;
  analyst: string;
  signal_hash: string;
  question: string;
  category: string;
  verdict: "YES" | "NO" | "SKIP";
  confidence: number;          // 0..1
  reasoning: string;
  tldr: string;                // one-sentence summary for subscribers
  source_cost_usd: number;     // what the Daemon spent (we spent 0)
}

export interface AnalystProfile {
  name: string;
  color: string;
  beat: string;                     // human description
  categoryWeights: Record<string, number>; // 0..1, bias toward these categories
  style: string;                    // prompt-styling for the LLM
}

export async function analyzeSignal(
  profile: AnalystProfile,
  signal: Signal,
  openai: OpenAI,
  model: string,
): Promise<Alert | null> {
  // Beat gate: low weight → skip to save tokens
  const w = profile.categoryWeights[String(signal.question.category)] ?? 0.2;
  if (w < 0.3 && Math.random() > w * 2) return null;

  // Miner's existing result (text only, truncated for context)
  const minerText = (() => {
    try {
      const r = signal.execution.result as { choices?: Array<{ message?: { content?: string } }> };
      const content = r?.choices?.[0]?.message?.content;
      if (typeof content === "string") return content.slice(0, 1800);
      return JSON.stringify(signal.execution.result).slice(0, 1800);
    } catch {
      return "(unparseable)";
    }
  })();

  const systemPrompt = `You are ${profile.name}, an autonomous research analyst specializing in: ${profile.beat}

Style: ${profile.style}

A prediction question has arrived from the Telegraph Daemon feed, along with the raw miner output. Your job: read both, then publish your own calibrated prediction.

Rules:
- Pick YES, NO, or SKIP (SKIP when the question is outside your beat or the evidence is insufficient).
- Confidence must be honest. 0.5 means coin-flip. >0.85 is only for things you can defend as near-certain.
- The tldr must be ONE short sentence a subscriber can scan in < 2 seconds.
- Reasoning: 1-3 sentences, cite what in the miner output drove your verdict.
- Respond as JSON only, no markdown, matching: {"verdict":"YES|NO|SKIP","confidence":0.0,"tldr":"...","reasoning":"..."}`;

  const userPrompt = `QUESTION: ${signal.question.text}
CATEGORY: ${signal.question.category}
INTEREST SCORE: ${signal.question.interest_score}/10
SOURCE: ${signal.source}

MINER OUTPUT (${signal.routing.subnet_name ?? "?"}):
${minerText}

Publish your prediction.`;

  let raw: string;
  try {
    const r = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });
    raw = r.choices[0]?.message.content ?? "{}";
  } catch (e) {
    return null;
  }

  let parsed: { verdict?: string; confidence?: number; tldr?: string; reasoning?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const verdict = String(parsed.verdict ?? "SKIP").toUpperCase() as Alert["verdict"];
  if (!["YES", "NO", "SKIP"].includes(verdict)) return null;
  if (verdict === "SKIP") return null;

  return {
    ts: Date.now(),
    analyst: profile.name,
    signal_hash: signal.signal_hash,
    question: signal.question.text,
    category: String(signal.question.category),
    verdict,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    reasoning: String(parsed.reasoning ?? "").slice(0, 500),
    tldr: String(parsed.tldr ?? signal.question.text).slice(0, 180),
    source_cost_usd: signal.execution.cost_usd ?? 0,
  };
}
