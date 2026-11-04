/**
 * Read-only client for the Telegraph Daemon Feed — the firehose of signals
 * the Daemon produces across the network. Free to read, paginated, filterable.
 *
 * This is the core input to Oracle Arena v2: analysts watch this stream,
 * detect patterns, and publish their own alerts as derived signals.
 */
import { request } from "undici";

const DAEMON = process.env.TELEGRAPH_DAEMON_URL ?? "https://devnode.telegraphprotocol.com/daemon";

export type Category =
  | "POLITICS" | "ECONOMICS" | "GEOPOLITICS" | "TECHNOLOGY" | "CLIMATE"
  | "HEALTH" | "FINANCE" | "CRYPTO" | "SPORTS" | "SCIENCE" | "SOCIAL"
  | "AI" | "PHARMA" | "LAW" | "OTHER";

export interface Signal {
  id: string;
  type?: string;
  source?: string;              // 'user' for paid Engine requests, else daemon collector
  status?: string;
  created_at: string;
  signal_hash: string;
  question: {
    text: string;
    category: Category | string;
    interest_score: number;     // 0..10
  };
  routing: {
    subnet_id?: string;
    subnet_name?: string;
    miner_slug?: string;
    reasoning?: string;
    intent?: string;
  };
  execution: {
    result: unknown;
    cost_usd?: number;
    duration_ms?: number;
  };
}

export interface FeedQuery {
  category?: Category;
  source?: string;
  sort?: "recent" | "interest" | "affected" | "audience";
  order?: "desc" | "asc";
  since?: string;                // RFC3339
  until?: string;
  since_hours?: number;
  min_interest?: number;         // 0..10
  limit?: number;                // 1..100
  offset?: number;
  exclude_user_source?: boolean; // local filter, drops source==='user'
}

export interface FeedResponse {
  results: Signal[];
  total: number;
  limit: number;
  offset: number;
}

function buildUrl(path: string, q: Record<string, unknown>): string {
  const url = new URL(DAEMON + path);
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * Paginated query of recent signals.
 */
export async function queryFeed(q: FeedQuery = {}): Promise<FeedResponse> {
  const { exclude_user_source, ...passthrough } = q;
  const url = buildUrl("/api/questions", passthrough);
  const { statusCode, body } = await request(url);
  if (statusCode !== 200) {
    const text = await body.text();
    throw new Error(`Daemon ${statusCode}: ${text.slice(0, 200)}`);
  }
  const data = (await body.json()) as FeedResponse;
  if (exclude_user_source) {
    data.results = data.results.filter((r) => r.source !== "user");
  }
  return data;
}

/**
 * Top signals — supports only category, since_hours, limit (1..50).
 */
export async function topSignals(opts: { category?: Category; since_hours?: number; limit?: number } = {}): Promise<Signal[]> {
  const url = buildUrl("/api/questions/top", opts);
  const { statusCode, body } = await request(url);
  if (statusCode !== 200) throw new Error(`Daemon top ${statusCode}`);
  const data = (await body.json()) as FeedResponse;
  return data.results;
}

/**
 * Categories the Daemon currently publishes, with per-category stats.
 */
export async function listCategories(): Promise<Array<Record<string, unknown>>> {
  const { body } = await request(`${DAEMON}/api/categories`);
  const data = (await body.json()) as { categories?: Array<Record<string, unknown>> };
  return data.categories ?? (data as unknown as Array<Record<string, unknown>>);
}

/**
 * Poll-based async iterator: yields each new signal as it appears in the feed.
 * Keeps an in-memory set of seen signal_hash values. Not durable across restarts
 * — for persistence, write hashes to SQLite as the consumer processes them.
 *
 * @param q        filter + pagination; `limit` controls how deep we look each poll
 * @param interval ms between polls
 */
export async function* streamNewSignals(
  q: FeedQuery = { sort: "recent", limit: 50, exclude_user_source: true },
  interval = 10_000,
): AsyncGenerator<Signal, void, void> {
  const seen = new Set<string>();
  let first = true;
  while (true) {
    try {
      const page = await queryFeed(q);
      // Oldest first on each tick so consumers see chronological order
      for (const sig of [...page.results].reverse()) {
        if (seen.has(sig.signal_hash)) continue;
        seen.add(sig.signal_hash);
        if (first) continue; // skip pre-existing signals on the very first poll
        yield sig;
      }
      first = false;
    } catch (e) {
      console.error("daemon poll error:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
