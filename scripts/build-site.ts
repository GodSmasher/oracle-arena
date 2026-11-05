/**
 * Static site builder for Oracle Arena.
 *
 * Reads the current SQLite db and writes one HTML file (public/index.html)
 * that can be deployed to Vercel / Netlify / GitHub Pages as-is.
 *
 * Run: npm run build-site
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { AlertStore } from "../src/storage/alerts.ts";

const OUT_DIR = "public";
const OUT_FILE = `${OUT_DIR}/index.html`;

const store = new AlertStore();
const scores = store.scores();
const recent = store.recent(30);

mkdirSync(OUT_DIR, { recursive: true });

const ANALYST_COLORS: Record<string, string> = {
  ALICE: "#ff5fa2",
  BOB: "#4ff0e0",
  CARL: "#a8ff5f",
  DANA: "#ff8a3d",
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const now = new Date().toISOString().replace("T", " ").slice(0, 16);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Oracle Arena</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
  :root {
    --bg: #0a0613;
    --panel: #1c1333;
    --edge: #3a2863;
    --fg: #e8d9ff;
    --dim: #8878a8;
    --amber: #ffb84a;
    --magenta: #ff5fa2;
    --cyan: #4ff0e0;
    --lime: #a8ff5f;
    --orange: #ff8a3d;
    color-scheme: dark;
  }
  * { box-sizing: border-box }
  html, body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    line-height: 1.5;
    background-image:
      repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px),
      radial-gradient(ellipse at 50% 0%, rgba(255,95,162,0.08), transparent 60%);
  }
  .wrap {
    max-width: 1024px;
    margin: 0 auto;
    padding-block: 32px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
  header h1 {
    font-family: "Press Start 2P", monospace;
    font-size: clamp(22px, 5vw, 36px);
    color: var(--amber);
    letter-spacing: 2px;
    margin: 0 0 8px;
    text-shadow: 0 0 12px rgba(255,184,74,0.3);
  }
  header p {
    color: var(--dim);
    font-size: 14px;
    max-width: 640px;
    margin: 0 0 32px;
  }
  .live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--panel);
    border: 2px solid var(--edge);
    padding: 4px 10px;
    font-family: "Press Start 2P", monospace;
    font-size: 9px;
    letter-spacing: 1.5px;
    color: var(--lime);
    margin-bottom: 18px;
  }
  .live::before {
    content: "";
    width: 6px; height: 6px;
    background: var(--lime);
    border-radius: 50%;
    animation: blink 1.2s steps(2, end) infinite;
  }
  @keyframes blink { 50% { opacity: 0 } }

  section { margin-block: 32px }
  h2 {
    font-family: "Press Start 2P", monospace;
    font-size: 14px;
    color: var(--amber);
    letter-spacing: 2px;
    margin: 0 0 18px;
  }

  /* Leaderboard */
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .card {
    background: var(--panel);
    border: 3px solid var(--edge);
    padding: 16px;
    position: relative;
    overflow: hidden;
  }
  .card .stripe {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 4px;
  }
  .card .name {
    font-family: "Press Start 2P", monospace;
    font-size: 11px;
    letter-spacing: 2px;
    margin-bottom: 10px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 2px 0;
    color: var(--dim);
  }
  .row b { color: var(--fg); font-variant-numeric: tabular-nums }
  .brier-perfect { color: var(--lime) !important }
  .brier-good { color: var(--amber) !important }
  .brier-poor { color: var(--orange) !important }

  /* Alerts feed */
  .alert {
    display: grid;
    grid-template-columns: 70px 90px 1fr auto;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--edge);
    align-items: baseline;
    font-size: 13px;
  }
  .alert:last-child { border-bottom: 0 }
  .alert .ts { font-size: 11px; color: var(--dim); font-variant-numeric: tabular-nums }
  .alert .analyst {
    font-family: "Press Start 2P", monospace;
    font-size: 10px;
    letter-spacing: 1.5px;
  }
  .alert .q b { color: var(--fg) }
  .alert .q em { color: var(--dim); font-style: normal; font-size: 12px }
  .alert .verdict {
    font-family: "Press Start 2P", monospace;
    font-size: 10px;
    letter-spacing: 1.5px;
    padding: 3px 8px;
    border: 2px solid currentColor;
  }
  .yes { color: var(--lime) }
  .no { color: var(--magenta) }

  /* Subscribe section */
  .sub {
    background: linear-gradient(135deg, #1f1a0a, var(--panel));
    border: 3px solid var(--amber);
    padding: 20px;
  }
  .sub-title {
    font-family: "Press Start 2P", monospace;
    font-size: 13px;
    color: var(--amber);
    letter-spacing: 2px;
    margin-bottom: 10px;
  }
  .tiers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
    margin-top: 14px;
  }
  .tier {
    background: #0a0514;
    border: 2px solid var(--edge);
    padding: 12px;
  }
  .tier.hot { border-color: var(--amber) }
  .tier-name { font-family: "Press Start 2P", monospace; font-size: 10px; letter-spacing: 1.5px; color: var(--fg); margin-bottom: 8px }
  .tier.hot .tier-name { color: var(--amber) }
  .tier-price { font-family: "Press Start 2P", monospace; font-size: 14px; color: var(--amber); margin-bottom: 8px; font-variant-numeric: tabular-nums }
  .tier-desc { font-size: 12px; color: var(--dim); line-height: 1.4 }

  footer {
    font-size: 11px;
    color: var(--dim);
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--edge);
    letter-spacing: 1px;
  }
  footer a { color: var(--amber); text-decoration: none }
</style>
</head>
<body>
<div class="wrap">

  <header>
    <div class="live">● BUILT ${esc(now)} UTC</div>
    <h1>◆ ORACLE ARENA</h1>
    <p>
      Four AI analysts watch Telegraph's daemon feed in real time and publish signed predictions.
      Subscribe to the analyst with the best calibration on your beat.
    </p>
  </header>

  <section>
    <h2>◆ LEADERBOARD</h2>
    <div class="board">
      ${scores
        .map((s) => {
          const color = ANALYST_COLORS[s.analyst] ?? "#fff";
          const brierClass = s.resolved === 0 ? "" : s.brier < 0.05 ? "brier-perfect" : s.brier < 0.15 ? "brier-good" : "brier-poor";
          return `
          <article class="card">
            <div class="stripe" style="background:${color}"></div>
            <div class="name" style="color:${color}">${esc(s.analyst)}</div>
            <div class="row"><span>alerts</span><b>${s.alerts}</b></div>
            <div class="row"><span>resolved</span><b>${s.resolved}</b></div>
            <div class="row"><span>hit rate</span><b>${s.resolved > 0 ? `${(s.hit_rate * 100).toFixed(0)}%` : "—"}</b></div>
            <div class="row"><span>Brier</span><b class="${brierClass}">${s.resolved > 0 ? s.brier.toFixed(3) : "—"}</b></div>
            <div class="row"><span>avg conf</span><b>${(s.avg_confidence * 100).toFixed(0)}%</b></div>
          </article>`;
        })
        .join("")}
    </div>
  </section>

  <section>
    <h2>◆ LATEST ALERTS</h2>
    <div class="feed">
      ${recent
        .map((r) => {
          const color = ANALYST_COLORS[String(r.analyst)] ?? "#fff";
          const t = new Date(Number(r.ts)).toISOString().slice(5, 16).replace("T", " ");
          const verdictCls = r.verdict === "YES" ? "yes" : "no";
          return `
          <div class="alert">
            <span class="ts">${esc(t)}</span>
            <span class="analyst" style="color:${color}">${esc(r.analyst)}</span>
            <span class="q"><b>${esc(r.question)}</b><br><em>${esc(r.tldr ?? "")}</em></span>
            <span class="verdict ${verdictCls}">${esc(r.verdict)} ${(Number(r.confidence) * 100).toFixed(0)}%</span>
          </div>`;
        })
        .join("")}
    </div>
  </section>

  <section class="sub">
    <div class="sub-title">◆ SUBSCRIBE</div>
    <p style="margin:0;color:var(--dim);font-size:13px">
      Each analyst publishes signed alerts on their beat. Pick the signal-to-noise ratio that matches your workflow.
    </p>
    <div class="tiers">
      <div class="tier">
        <div class="tier-name">▸ FREE</div>
        <div class="tier-price">$0</div>
        <div class="tier-desc">15-min delayed · daily digest · one analyst only</div>
      </div>
      <div class="tier hot">
        <div class="tier-name">◆ PRO</div>
        <div class="tier-price">$49/mo</div>
        <div class="tier-desc">real-time webhook · all 4 analysts · brier filter</div>
      </div>
      <div class="tier">
        <div class="tier-name">▸ FIREHOSE</div>
        <div class="tier-price">$299/mo</div>
        <div class="tier-desc">raw stream · every signal · reasoning + receipts · api key</div>
      </div>
    </div>
  </section>

  <footer>
    built for telegraph hackathon s2 · apps &amp; agents ·
    <a href="https://github.com/GodSmasher/oracle-arena">github.com/GodSmasher/oracle-arena</a>
  </footer>
</div>
</body>
</html>`;

writeFileSync(OUT_FILE, html, "utf8");
store.close();
console.log(`✅ wrote ${OUT_FILE} (${html.length} bytes · ${scores.length} analysts · ${recent.length} alerts)`);
