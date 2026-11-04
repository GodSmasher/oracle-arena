/**
 * Check ETH + USDC balances of all 4 agent wallets.
 * Run: npm run balance
 */
import "dotenv/config";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const USDC = process.env.USDC_TEST_ADDRESS as Address;
const RPC = process.env.SEPOLIA_RPC!;

const ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const PKS = [
  process.env.AGENT_ALICE_PK,
  process.env.AGENT_BOB_PK,
  process.env.AGENT_CARL_PK,
  process.env.AGENT_DANA_PK,
] as const;

async function main() {
  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
  console.log("Agent".padEnd(8), "Address".padEnd(44), "ETH".padStart(14), "USDC".padStart(12));
  console.log("-".repeat(80));
  for (let i = 0; i < 4; i++) {
    const pk = PKS[i];
    if (!pk || !pk.startsWith("0x") || pk.length !== 66) continue;
    const addr = privateKeyToAccount(pk as `0x${string}`).address;
    const name = ["ALICE", "BOB", "CARL", "DANA"][i]!;
    const [eth, usdc] = await Promise.all([
      client.getBalance({ address: addr }),
      client.readContract({ address: USDC, abi: ABI, functionName: "balanceOf", args: [addr] }),
    ]);
    console.log(
      name.padEnd(8),
      addr.padEnd(44),
      formatUnits(eth, 18).padStart(14),
      formatUnits(usdc, 6).padStart(12),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
