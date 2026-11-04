/**
 * Minimal Telegraph engine client with escrow-scheme x402 payment signing.
 *
 * Flow:
 *   1. Pre-fund the caller's escrow via EscrowFacet.depositUSDC (one-off, see scripts/escrow-deposit.ts).
 *   2. Each /v1/ask call returns 402 with payment requirements.
 *   3. Sign the escrow payment message (EIP-191 personal_sign) and resend with X-PAYMENT header.
 *   4. Server deducts from the escrow at epoch close.
 */
import { request } from "undici";
import { type Hex, bytesToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ENGINE = process.env.TELEGRAPH_ENGINE_URL ?? "https://devnode.telegraphprotocol.com/engine";

export interface AskResult {
  miner_id?: string;
  miner_name?: string;
  result: unknown;
  result_shape?: "intent" | "raw";
  cost_usd?: number;
  duration_ms?: number;
  reasoning?: string;
  intent?: string;
  signal_hash?: string;
  warnings?: unknown[];
}

export interface AskBody {
  query?: string;
  intent?: string;
  params?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

interface PaymentRequirement {
  scheme: "exact" | "escrow";
  network: string;
  payTo: `0x${string}`;
  maxAmountRequired?: string;
  price?: string;
  asset?: `0x${string}`;
  extra?: Record<string, unknown>;
}

interface PaymentRequired {
  accepts: PaymentRequirement[];
  error?: string;
  x402Version?: number;
}

/**
 * Sign the escrow payment message (EIP-191 personal_sign).
 * The template is inside `req.extra.message` with {from}/{nonce}/{validAfter}/{validBefore} placeholders.
 */
async function signEscrow(pk: Hex, req: PaymentRequirement): Promise<string> {
  const account = privateKeyToAccount(pk);
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: req.maxAmountRequired ?? "10000",
    validAfter: String(now - 10),
    validBefore: String(now + 60), // node allows max 2 min window
    nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  };

  // The node rebuilds the message with the from-address lowercased.
  const template = String(req.extra?.message ?? "");
  if (!template) throw new Error("escrow challenge has no message template");
  const message = template
    .replace(/\{from\}/g, authorization.from.toLowerCase())
    .replace(/\{nonce\}/g, authorization.nonce)
    .replace(/\{validAfter\}/g, authorization.validAfter)
    .replace(/\{validBefore\}/g, authorization.validBefore);

  const signature = await account.signMessage({ message });

  const envelope = {
    x402Version: 2,
    scheme: "escrow",
    network: req.network,
    payload: { signature, authorization },
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

/**
 * Ask Telegraph a question, paying from escrow on 402.
 */
export async function ask(pk: Hex, body: AskBody): Promise<AskResult> {
  const url = `${ENGINE}/v1/ask`;
  const first = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (first.statusCode === 200) {
    return (await first.body.json()) as AskResult;
  }

  if (first.statusCode !== 402) {
    const text = await first.body.text();
    throw new Error(`Unexpected ${first.statusCode}: ${text}`);
  }

  const paymentReq = (await first.body.json()) as PaymentRequired;
  const escrow = paymentReq.accepts.find((a) => a.scheme === "escrow");
  if (!escrow) throw new Error("No escrow payment scheme offered");

  const paymentHeader = await signEscrow(pk, escrow);

  const paid = await request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": paymentHeader,
    },
    body: JSON.stringify(body),
  });

  if (paid.statusCode !== 200) {
    const text = await paid.body.text();
    throw new Error(`Payment failed ${paid.statusCode}: ${text.slice(0, 400)}`);
  }

  return (await paid.body.json()) as AskResult;
}

/**
 * List live intents (free, no payment).
 */
export async function listIntents(): Promise<Array<Record<string, unknown>>> {
  const { body } = await request(`${ENGINE}/v1/intents`);
  const data = (await body.json()) as { intents: Array<Record<string, unknown>> };
  return data.intents.filter(
    (i) => i.canonical === true && (i.miner_count as number) > 0,
  );
}
