/**
 * An Oracle Arena agent.
 *
 * Given a question, budget, and a Nebius LLM, the agent decides which intents
 * to buy, spends up to its budget, and returns a final bid (answer + confidence).
 *
 * Every purchase is logged as a Receipt — this is the stream the frontend will show.
 */
import OpenAI from "openai";
import type { Hex } from "viem";
import { ask, type AskResult } from "../telegraph/client.ts";

export interface Receipt {
  ts: number;
  agent: string;
  action: "buy" | "think" | "bid";
  intent?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  cost_usd?: number;
  signal_hash?: string;
  note?: string;
}

export interface Bid {
  answer: string;
  confidence: number;
  reasoning: string;
}

export interface AgentConfig {
  name: string;
  pk: Hex;
  personality: string;
  budgetUsd: number;
  maxPurchases: number;
  intentHints?: string[];
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buy_intelligence",
      description:
        "Buy an answer from Telegraph for a specific intent. Costs ~$0.01 USDC. Use for facts you don't know with certainty.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            description:
              "Canonical intent name, e.g. CRYPTO_PRICE_USD, EVENT_OUTCOME_RESOLUTION_GENERAL, FACT_CHECK_GENERAL",
          },
          params: {
            type: "object",
            description: "Typed params for the intent, e.g. { symbol: 'BTC' }",
            additionalProperties: true,
          },
          reason: {
            type: "string",
            description: "Short reason why this purchase helps answer the question.",
          },
        },
        required: ["intent", "params", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_free_form",
      description:
        "Ask Telegraph a natural-language question and let it auto-route to a miner. Use when no clean intent fits. Costs ~$0.01 USDC.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The plain-language question." },
          reason: { type: "string" },
        },
        required: ["query", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_bid",
      description:
        "Lock in your final answer. Call this only when you have enough information. After this the round ends for you.",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string", description: "Short answer. YES/NO or a value." },
          confidence: {
            type: "number",
            description: "Your confidence 0.0–1.0. Be honest; the judge punishes overconfidence.",
          },
          reasoning: { type: "string" },
        },
        required: ["answer", "confidence", "reasoning"],
      },
    },
  },
];

export async function runAgent(
  cfg: AgentConfig,
  question: string,
  intentCatalogue: string[],
  openai: OpenAI,
  model: string,
): Promise<{ bid: Bid | null; receipts: Receipt[]; spent: number }> {
  const receipts: Receipt[] = [];
  let spent = 0;
  let purchases = 0;
  let bid: Bid | null = null;

  // Rank the catalogue: hinted intents first (if they're live), then the rest.
  const hinted = (cfg.intentHints ?? []).filter((i) => intentCatalogue.includes(i));
  const rest = intentCatalogue.filter((i) => !hinted.includes(i));
  const prioritizedCatalogue = [...hinted, ...rest].slice(0, 80);

  const preferredBlock =
    hinted.length > 0
      ? `Your preferred intent families (play to your strengths unless the question clearly needs something else):
${hinted.map((i) => "  - " + i).join("\n")}
`
      : "";

  const systemPrompt = `You are ${cfg.name}, an autonomous research agent in the Oracle Arena.

Personality: ${cfg.personality}
${preferredBlock}
Budget: $${cfg.budgetUsd.toFixed(2)} USDC · max ${cfg.maxPurchases} purchases · each costs ~$0.01.

Your job: answer the prediction question by buying evidence through Telegraph
(the intelligence marketplace), then placing a bid with an honest confidence.

Live intents (${intentCatalogue.length} total, top ${prioritizedCatalogue.length} shown):
${prioritizedCatalogue.join(", ")}

Strategy guidance:
- If the question has only ONE dimension (a single price, yes/no about one fact), one good purchase is enough.
- If the question combines MULTIPLE dimensions (e.g. "will X happen given Y and Z"), buy 2-3 sources from
  different angles before bidding — this is the whole point of a market.
- Lean toward your preferred intent families first; only reach outside them when nothing there fits.
- You are competing with 3 other agents who each have different strengths.
  Picking the same obvious intent they will pick wastes your edge.
- Confidence calibration: if you only bought one source, cap confidence around 0.80;
  if you cross-checked 2+ independent sources that agreed, you may go higher.

When you have enough info, call place_bid. That ends your turn. Be concise.
`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `QUESTION: ${question}` },
  ];

  const MAX_TURNS = cfg.maxPurchases + 3;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices[0]!;
    const toolCalls = choice.message.tool_calls ?? [];

    if (!toolCalls.length) {
      receipts.push({
        ts: Date.now(),
        agent: cfg.name,
        action: "think",
        note: choice.message.content ?? "(no content)",
      });
      break;
    }

    messages.push(choice.message);

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const args = JSON.parse(call.function.arguments);
      const name = call.function.name;

      if (name === "place_bid") {
        bid = {
          answer: String(args.answer),
          confidence: Number(args.confidence),
          reasoning: String(args.reasoning),
        };
        receipts.push({
          ts: Date.now(),
          agent: cfg.name,
          action: "bid",
          note: `${bid.answer} (conf=${bid.confidence.toFixed(2)})`,
        });
        return { bid, receipts, spent };
      }

      if (name === "buy_intelligence" || name === "ask_free_form") {
        if (purchases >= cfg.maxPurchases || spent >= cfg.budgetUsd) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "budget or purchase limit reached, place a bid now" }),
          });
          continue;
        }
        purchases++;
        receipts.push({
          ts: Date.now(),
          agent: cfg.name,
          action: "buy",
          intent: name === "buy_intelligence" ? args.intent : "(auto-route)",
          params: name === "buy_intelligence" ? args.params : { query: args.query },
          note: args.reason,
        });

        let result: AskResult;
        try {
          result =
            name === "buy_intelligence"
              ? await ask(cfg.pk, { intent: args.intent, params: args.params })
              : await ask(cfg.pk, { query: args.query });
        } catch (e) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: (e as Error).message }),
          });
          continue;
        }

        spent += result.cost_usd ?? 0.01;
        receipts.push({
          ts: Date.now(),
          agent: cfg.name,
          action: "buy",
          intent: result.intent,
          cost_usd: result.cost_usd,
          signal_hash: result.signal_hash,
          note: `${result.miner_name} → ${JSON.stringify(result.result).slice(0, 120)}`,
        });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            result: result.result,
            cost_usd: result.cost_usd,
            signal_hash: result.signal_hash,
            remaining_budget: Math.max(0, cfg.budgetUsd - spent),
            remaining_purchases: cfg.maxPurchases - purchases,
          }),
        });
      }
    }
  }

  return { bid, receipts, spent };
}
