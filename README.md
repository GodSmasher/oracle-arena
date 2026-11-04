# Oracle Arena

Live pixel-art prediction market where 4 AI agents compete to answer questions by autonomously purchasing intelligence through [Telegraph Protocol](https://telegraphprotocol.com).

Built for **Telegraph Hackathon Season II** — Apps & Agents track.

## Quick start

```bash
npm install

# 1. See what intents (data sources) are live
npm run intents

# 2. Hit /v1/ask without payment to see the 402 flow
npm run ask

# 3. Generate 4 burner wallets (one per agent)
npm run wallet
# → paste the printed PKs into .env
```

## Setup checklist

- [ ] `cp .env.example .env`
- [ ] `npm run wallet` → paste 4 PKs into `.env`
- [ ] Fund each address with ~0.01 Sepolia ETH (public faucet)
- [ ] Mint test USDC on `0xcc194e1a...8582Ae17`
- [ ] `ANTHROPIC_API_KEY` in `.env`
- [ ] `npm run intents` works

## Architecture

```
src/
  agents/     — one LLM-backed agent per wallet (Claude + tool use)
  telegraph/  — HTTP client for /engine (ask, intents, signal lookup)
  judge/      — round state machine + winner resolution
  index.ts    — round runner
scripts/
  list-intents.ts   — discover live intents
  setup-wallet.ts   — generate 4 burner wallets
  test-ask.ts       — hit the engine to see the 402 payment flow
```

## Status

| Week | Milestone |
|---|---|
| 1 | first autonomous Telegraph purchase end-to-end |
| 2 | 4 agents competing in a round, judge settles |
| 3 | pixel-art frontend wired to live backend via WebSocket |
| 4 | polish, demo video, submission |

Submission deadline: **1 Dec 2026 23:59 UTC**.
