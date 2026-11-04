# Oracle Arena

Live pixel-art prediction market where 4 AI agents compete to answer questions by autonomously purchasing intelligence through [Telegraph Protocol](https://telegraphprotocol.com).

Built for **Telegraph Hackathon Season II** — Apps & Agents track.
Missions **#10 Model Economy** + **#7 Consumer Platform**.

**Concept mockup:** https://claude.ai/artifact/H8bHRDNLBgAZDhZHWVLtNx

---

## Status

End-to-end flow works on Sepolia testnet:

- 4 autonomous agents (Alice, Bob, Carl, Dana)
- Each reasons with a Nebius-hosted LLM (default: Qwen3-235B-Instruct)
- Each pays Telegraph $0.01 USDC per answer via the x402 **escrow** scheme
- Receipts carry a `signal_hash` from the miner (on-chain proof)
- An off-chain judge compares bids to ground truth, declares a winner, and pays out the pool

A 4-agent round takes ~8 seconds and costs ~$0.04 USDC.

## Quick start

```bash
npm install
cp .env.example .env
# fill NEBIUS_API_KEY in .env

# 1. Discover live Telegraph intents (free)
npm run intents

# 2. Generate 4 burner wallets — paste PKs into .env
npm run wallet

# 3. Fund the first wallet with ~0.5 Sepolia ETH from any faucet
#    e.g. https://sepolia-faucet.pk910.de

# 4. Mint 100 USDC testnet tokens to each agent
npm run mint

# 5. Approve + deposit 10 USDC per agent into Telegraph escrow
npm run escrow:deposit

# 6. Run a full round — 4 agents, 1 judge
npm run round -- "What is the current price of Bitcoin in USD?" "95000"
```

## Architecture

```
src/
  telegraph/client.ts   — /v1/ask with automatic x402 escrow signing (EIP-191)
  agents/agent.ts       — LLM tool-use loop with buy_intelligence / ask_free_form / place_bid
  arena/
    personalities.ts    — Alice/Bob/Carl/Dana voices (distinct strategies)
    round.ts            — Promise.all over 4 agents, then judge
  judge/judge.ts        — distance scoring (YES/NO, numeric, Jaccard for text)
                          with a 20% threshold for payout
scripts/
  list-intents.ts       — discover canonical intents + miner counts
  setup-wallet.ts       — generate 4 burner PKs
  mint-usdc.ts          — public mint on the test-USDC contract
  escrow-deposit.ts     — approve + EscrowFacet.depositUSDC for all 4 agents
  run-round.ts          — colored terminal output of a full round
  test-ask.ts           — show the 402 response shape (debug)
  test-judge.ts         — judge dry-run with fake bids (no API, no gas)
```

## Payment flow

Each Telegraph `/v1/ask` returns `402 Payment Required` with two options:

- `exact` — EIP-3009 TransferWithAuthorization (gasless USDC transfer the server submits)
- `escrow` — EIP-191 personal_sign of a challenge; funds are deducted at epoch close from a pre-deposited balance

We use **escrow** because it's dramatically simpler: deposit once, sign a short challenge per request, no per-request gas.

## Roadmap

See the **Issues** tab for the live backlog. Milestones:

| Week | Goal |
|---|---|
| 1 ✅ | first autonomous Telegraph purchase end-to-end |
| 2 | diverse intents per agent, multi-source aggregation, SQLite round history |
| 3 | pixel-art Next.js frontend wired to the backend over WebSocket |
| 4 | signal-feed API + subscription tiers, demo video, submission |

**Submission deadline:** 1 Dec 2026 23:59 UTC.

## Testnet constants (Sepolia)

| | |
|---|---|
| Chain ID | `11155111` |
| USDC (test) | `0xcc194e1a843B658526D0D5C431f670028582Ae17` (public `mint()`) |
| Telegraph Diamond | `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b` |
| Engine | `https://devnode.telegraphprotocol.com/engine` |
