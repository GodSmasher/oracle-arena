/**
 * Minimal Telegraph engine client with x402 payment signing.
 *
 * Flow: ask() → first request returns 402 → sign EIP-3009 transferWithAuthorization
 *       payload → re-send with X-PAYMENT header → get the answer + receipt.
 *
 * For MVP we use the per-request x402 "exact" scheme. Escrow is a later optimization.
 */
import { request } from "undici";
import {
  type Account,
  type Hex,
  createWalletClient,
  http,
  parseUnits,
  keccak256,
  encodeAbiParameters,
  stringToBytes,
  bytesToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

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
  asset?: `0x${string}`;
  extra?: Record<string, unknown>;
}

interface PaymentRequired {
  accepts: PaymentRequirement[];
  error?: string;
  x402Version?: number;
}

/**
 * Sign an EIP-3009 TransferWithAuthorization payload for the given requirement.
 * This is the "exact" x402 scheme: a gasless USDC transfer the server can submit.
 */
async function signX402Exact(
  pk: Hex,
  req: PaymentRequirement,
): Promise<string> {
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http() });

  const validAfter = BigInt(Math.floor(Date.now() / 1000) - 60);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const amount = BigInt(req.maxAmountRequired ?? "10000");
  const asset = req.asset ?? (process.env.USDC_TEST_ADDRESS as `0x${string}`);

  const domain = {
    name: (req.extra?.name as string) ?? "USD Coin",
    version: (req.extra?.version as string) ?? "2",
    chainId: 11155111,
    verifyingContract: asset,
  } as const;

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;

  const message = {
    from: account.address,
    to: req.payTo,
    value: amount,
    validAfter,
    validBefore,
    nonce: nonce as `0x${string}`,
  };

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: req.network,
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: req.payTo,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      },
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Ask Telegraph a question, paying automatically on 402.
 */
export async function ask(pk: Hex, body: AskBody): Promise<AskResult> {
  const first = await request(`${ENGINE}/v1/ask`, {
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
  const exact = paymentReq.accepts.find((a) => a.scheme === "exact");
  if (!exact) throw new Error("No exact payment scheme offered");

  const paymentHeader = await signX402Exact(pk, exact);

  const paid = await request(`${ENGINE}/v1/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": paymentHeader,
    },
    body: JSON.stringify(body),
  });

  if (paid.statusCode !== 200) {
    const text = await paid.body.text();
    throw new Error(`Payment failed ${paid.statusCode}: ${text}`);
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
