/**
 * Generate 4 burner wallets for the agents (Alice, Bob, Carl, Dana).
 * Prints the private keys + addresses. Save PKs to .env, keep them PRIVATE.
 *
 * Run: npm run wallet
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const AGENTS = ["ALICE", "BOB", "CARL", "DANA"] as const;

for (const name of AGENTS) {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  console.log(`# ${name}`);
  console.log(`AGENT_${name}_PK=${pk}`);
  console.log(`  address: ${account.address}`);
  console.log();
}

console.log("Next steps:");
console.log("  1. Paste the AGENT_*_PK lines into .env");
console.log("  2. Fund each address with ~0.01 Sepolia ETH (any public faucet)");
console.log("  3. Mint testnet USDC to each address:");
console.log("     cast send 0xcc194e1a843B658526D0D5C431f670028582Ae17 \\");
console.log('       "mint(address,uint256)" <addr> 10000000 \\');
console.log("       --rpc-url https://ethereum-sepolia-rpc.publicnode.com");
console.log("     (10000000 = 10 USDC at 6 decimals)");
