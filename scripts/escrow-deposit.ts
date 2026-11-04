/**
 * Approve USDC + deposit into each agent's Telegraph Escrow balance.
 * After this, paid /v1/ask calls just work — the server deducts per request.
 *
 * Only Alice has Sepolia ETH right now, so this first seeds Bob/Carl/Dana
 * with a little ETH for gas (one tx each), then each agent self-approves
 * and deposits its own 10 USDC.
 *
 * Run: npm run escrow:deposit
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const USDC = process.env.USDC_TEST_ADDRESS as Address;
const DIAMOND = process.env.TELEGRAPH_DIAMOND as Address;
const RPC = process.env.SEPOLIA_RPC!;

const ERC20 = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// EscrowFacet.depositUSDC(uint256) — adds to msg.sender's escrow balance
const ESCROW = [
  {
    name: "depositUSDC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "escrowBalanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const DEPOSIT_PER_AGENT = parseUnits("10", 6); // 10 USDC = 1000 requests
const GAS_SEED = parseEther("0.05"); // enough for a few dozen tx per agent

const AGENTS = [
  { name: "ALICE", pk: process.env.AGENT_ALICE_PK as Hex },
  { name: "BOB", pk: process.env.AGENT_BOB_PK as Hex },
  { name: "CARL", pk: process.env.AGENT_CARL_PK as Hex },
  { name: "DANA", pk: process.env.AGENT_DANA_PK as Hex },
];

async function main() {
  const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

  // 1. Alice seeds Bob/Carl/Dana with Sepolia ETH
  const alice = createWalletClient({
    account: privateKeyToAccount(AGENTS[0]!.pk),
    chain: sepolia,
    transport: http(RPC),
  });

  for (let i = 1; i < 4; i++) {
    const agent = AGENTS[i]!;
    const addr = privateKeyToAccount(agent.pk).address;
    const bal = await pub.getBalance({ address: addr });
    if (bal >= GAS_SEED) {
      console.log(`✓ ${agent.name} already has ${formatUnits(bal, 18)} ETH, skipping seed`);
      continue;
    }
    console.log(`→ Seeding ${agent.name} with ${formatUnits(GAS_SEED, 18)} ETH`);
    const hash = await alice.sendTransaction({ to: addr, value: GAS_SEED });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  ✅ ${hash}`);
  }

  // 2. Each agent: approve USDC to Diamond, then depositUSDC
  for (const agent of AGENTS) {
    const addr = privateKeyToAccount(agent.pk).address;
    const w = createWalletClient({
      account: privateKeyToAccount(agent.pk),
      chain: sepolia,
      transport: http(RPC),
    });

    console.log(`\n─── ${agent.name} (${addr}) ───`);

    // Approve
    const currentAllowance = await pub.readContract({
      address: USDC,
      abi: ERC20,
      functionName: "allowance",
      args: [addr, DIAMOND],
    });
    if (currentAllowance < DEPOSIT_PER_AGENT) {
      console.log(`→ Approving ${formatUnits(DEPOSIT_PER_AGENT, 6)} USDC to Diamond`);
      const hash = await w.writeContract({
        address: USDC,
        abi: ERC20,
        functionName: "approve",
        args: [DIAMOND, DEPOSIT_PER_AGENT],
      });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`  ✅ ${hash}`);
    } else {
      console.log(`✓ allowance already ${formatUnits(currentAllowance, 6)} USDC`);
    }

    // Deposit
    console.log(`→ Depositing ${formatUnits(DEPOSIT_PER_AGENT, 6)} USDC into escrow`);
    try {
      const hash = await w.writeContract({
        address: DIAMOND,
        abi: ESCROW,
        functionName: "depositUSDC",
        args: [DEPOSIT_PER_AGENT],
      });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`  ✅ ${hash}`);
    } catch (e) {
      console.error(`  ❌ deposit reverted: ${(e as Error).message.split("\n")[0]}`);
    }

    // Verify escrow balance
    try {
      const bal = await pub.readContract({
        address: DIAMOND,
        abi: ESCROW,
        functionName: "escrowBalanceOf",
        args: [addr],
      });
      console.log(`   escrow balance: ${formatUnits(bal, 6)} USDC`);
    } catch (e) {
      console.log(`   (escrowBalanceOf not readable, ok)`);
    }
  }

  console.log("\n🎉 Escrow funded. Paid /v1/ask calls should now return 200.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
