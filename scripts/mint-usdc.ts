/**
 * Mint testnet USDC to all 4 agent addresses from whichever wallet has Sepolia ETH.
 * The test USDC contract has a public mint(address, uint256). Each call costs ~$0 (just gas).
 *
 * Default mint: 100 USDC per agent (plenty for a hackathon — 10,000+ requests).
 *
 * Run: npm run mint
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const USDC = process.env.USDC_TEST_ADDRESS as Address;
const RPC = process.env.SEPOLIA_RPC!;
const PKS = [
  process.env.AGENT_ALICE_PK,
  process.env.AGENT_BOB_PK,
  process.env.AGENT_CARL_PK,
  process.env.AGENT_DANA_PK,
].filter((pk): pk is `0x${string}` => !!pk && pk.startsWith("0x") && pk.length === 66);

const USDC_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const MINT_AMOUNT = parseUnits("100", 6); // 100 USDC

async function main() {
  if (PKS.length !== 4) {
    console.error(`Expected 4 agent PKs in .env, found ${PKS.length}`);
    process.exit(1);
  }

  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const addresses = PKS.map((pk) => privateKeyToAccount(pk).address);

  console.log("Agent addresses:");
  for (let i = 0; i < 4; i++) {
    const name = ["ALICE", "BOB", "CARL", "DANA"][i];
    const bal = await publicClient.readContract({
      address: USDC,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [addresses[i]!],
    });
    const ethBal = await publicClient.getBalance({ address: addresses[i]! });
    console.log(
      `  ${name.padEnd(6)} ${addresses[i]}  USDC=${formatUnits(bal, 6).padStart(10)}  ETH=${formatUnits(ethBal, 18)}`,
    );
  }

  // Find the first wallet with Sepolia ETH to pay for gas
  let funder: `0x${string}` | null = null;
  let funderIdx = -1;
  for (let i = 0; i < PKS.length; i++) {
    const bal = await publicClient.getBalance({ address: addresses[i]! });
    if (bal > 0n) {
      funder = PKS[i]!;
      funderIdx = i;
      break;
    }
  }

  if (!funder) {
    console.error("\n❌ No wallet has Sepolia ETH yet.");
    console.error("   Fund at least one of the addresses above via a public faucet:");
    console.error("   https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    console.error("   https://www.alchemy.com/faucets/ethereum-sepolia");
    process.exit(1);
  }

  const funderName = ["ALICE", "BOB", "CARL", "DANA"][funderIdx];
  console.log(`\n✅ Using ${funderName} as gas payer for mints`);

  const wallet = createWalletClient({
    account: privateKeyToAccount(funder),
    chain: sepolia,
    transport: http(RPC),
  });

  for (let i = 0; i < 4; i++) {
    const name = ["ALICE", "BOB", "CARL", "DANA"][i];
    console.log(`\n→ Minting 100 USDC to ${name} (${addresses[i]})`);
    const hash = await wallet.writeContract({
      address: USDC,
      abi: USDC_ABI,
      functionName: "mint",
      args: [addresses[i]!, MINT_AMOUNT],
    });
    console.log(`  tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ✅ confirmed in block ${receipt.blockNumber}`);
  }

  console.log("\n🎉 All agents funded with 100 USDC each (10,000 requests of budget).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
