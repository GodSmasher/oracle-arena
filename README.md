# Oracle Arena

**4 AI analysts watch Telegraph's daemon feed in real-time and publish signed predictions. Subscribe to the analyst whose beat matches yours.**

Built for **Telegraph Hackathon Season II** — Apps & Agents track.
Missions **#10 Model Economy** + **#7 Consumer Platform**.

**Live demo:** https://godsmasher.github.io/oracle-arena/

Interactive concept mockup: https://claude.ai/artifact/H8bHRDNLBgAZDhZHWVLtNx

---

## How it works

The Telegraph **Daemon** publishes 150,000+ prediction-style questions, each scored 0–10 for interest and auto-answered by a ranked miner:

```
Will Russia attack a NATO country?     i=10  GEOPOLITICS   → collector-gdelt
Will GPT-6 Astra beat DeepMind Orion?  i=10  AI            → collector-hackernews
Will Ultragenyx gain TIO approval?      i=7  PHARMA        → collector-clinicaltrials
```

These signals are **free to read** via the public Daemon feed. Oracle Arena's 4 analysts:

- **ALICE** · Geopolitics / macro / conflict
- **BOB** · Markets / finance / economics
- **CARL** · Tech / AI / science / startups
- **DANA** · Pharma / health / climate / clinical trials

...each watch the feed, read the miner's raw output, and publish a calibrated prediction (`YES` / `NO` / `SKIP`) with confidence and a one-sentence tldr.

Over time, each analyst builds a track record on their beat. Subscribers (compliance teams, journalists, traders, investigators) pay a flat fee to follow the analyst whose signal matches their domain, paying a fraction of what they'd pay a Refinitiv/World-Check seat.

## Why this works where v1 didn't

**v1** was 4 agents live-buying $0.12 of intelligence per round to answer user-submitted predictions. Cost-per-answer was higher than any user would pay — pointed out by the Telegraph admin on day 1.

**v2** reads the daemon feed instead. Signals are free. Analysis is cheap (~$0.0005 of Nebius inference per alert). The product is the *curated per-analyst subscription*, not the raw intelligence.

## Quick start

```bash
npm install
cp .env.example .env
# fill NEBIUS_API_KEY in .env

# 1. See what the daemon is producing right now
npm run stream           # live tail
npx tsx scripts/feed-probe.ts   # one-shot snapshot

# 2. Run a live analyst session (reads feed, prints alerts, saves to SQLite)
npm run session -- 8 120   # min_interest 8, for 120 seconds

# 3. View the per-analyst leaderboard
npm run leaderboard
```

## Architecture

```
src/
  telegraph/
    daemon.ts       — free REST reader for the Daemon feed (core input)
    client.ts       — legacy: paid /v1/ask with x402 escrow (v1 path, kept for compat)
  agents/
    analyst.ts      — v2 analyst: reads a signal, publishes a signed Alert
    agent.ts        — v1 agent (kept for comparative benchmarks)
  arena/
    analysts.ts     — v2 analyst roster with category-weighted beats
    personalities.ts, round.ts  — v1 competitive rounds
  judge/judge.ts    — v1 distance-based winner picker
  storage/
    alerts.ts       — SQLite for v2 alerts
    db.ts           — SQLite for v1 rounds/bids/receipts
scripts/
  stream-watch.ts   — live-tail the daemon feed
  feed-probe.ts     — one-shot snapshot of recent signals + sources
  run-session.ts    — v2 analyst session runner
  leaderboard.ts    — per-analyst stats + latest alerts
  run-round.ts      — v1 competitive round runner
  escrow-deposit.ts — approve + deposit USDC for v1 paid calls
```

## Roadmap

See the **Issues** tab. Milestones:

| Week | Goal |
|---|---|
| 1 ✅ | v1 e2e (first autonomous Telegraph purchase) |
| 2 ✅ | v1 polish (diverse intents, multi-source, SQLite) |
| 2.5 ✅ | **pivot to v2** (daemon-feed consumption + analyst alerts) |
| 3 | Next.js pixel-art frontend over WebSocket event bus |
| 3.5 | Public signal-feed API + subscription tiers |
| 4 | Demo video, submission |

**Submission deadline:** 1 Dec 2026 23:59 UTC.

## Testnet constants (Sepolia)

| | |
|---|---|
| Chain ID | `11155111` |
| USDC (test) | `0xcc194e1a843B658526D0D5C431f670028582Ae17` (public `mint()`) |
| Telegraph Diamond | `0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b` |
| Engine | `https://devnode.telegraphprotocol.com/engine` |
| Daemon feed | `https://devnode.telegraphprotocol.com/daemon/api/questions` |
