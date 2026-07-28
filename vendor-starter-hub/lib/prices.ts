/**
 * Card price lookup — Pokemon TCG API (api.pokemontcg.io) provider.
 *
 * WHY THIS PROVIDER: it needs no account and no API key, and it returns
 * TCGplayer market/low/high refreshed daily. tcgapi.dev was the roadmap's
 * first choice but its Free/Hobby/Starter tiers are licensed for
 * NON-COMMERCIAL USE ONLY — commercial use starts at $49.99/mo. See the
 * roadmap note. The shape below is provider-agnostic on purpose so a paid
 * provider can be swapped in without touching the route or the UI.
 *
 * Server-only. Never import this into a client component.
 */

export type Finish = {
  label: string;
  market: number | null;
  low: number | null;
  high: number | null;
};

export type PriceCard = {
  id: string;
  name: string;
  setName: string;
  number: string;
  rarity: string | null;
  image: string | null;
  url: string | null;
  updatedAt: string | null;
  finishes: Finish[];
};

export type SearchResult =
  | { ok: true; cards: PriceCard[]; total: number; stale: boolean }
  | { ok: false; error: "empty_query" | "upstream" | "busy" };

const ENDPOINT = "https://api.pokemontcg.io/v2/cards";
// Ask for more than we show so unpriced cards can be sorted out of the way
// instead of taking up result slots. See sortForVendors().
const FETCH_SIZE = 20;
const SHOW_SIZE = 12;

/**
 * Build the upstream query.
 *
 * Verified against the live API before writing this:
 *  - `name:foo*` (trailing wildcard)            -> works
 *  - `name:foo* name:bar*` (AND of two terms)   -> works
 *  - `name:*foo*` (leading wildcard, one term)  -> 500s
 *  - `name:foo bar*` (space, unquoted)          -> 500s
 * So: strip punctuation the parser chokes on, split into words, give each
 * word a trailing wildcard, AND them together. Never pass raw user input —
 * a stray `:` or quote turns into query syntax.
 */
export function buildQuery(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  return words.map((w) => `name:${w}*`).join(" ");
}

export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}

/**
 * Cache + upstream budget.
 *
 * Keyless the API allows 1,000 requests/day and 30/minute — and that ceiling
 * is shared by every visitor, because the calls leave from our server, not
 * theirs. Prices only move once a day, so caching is not an optimisation
 * here, it is what keeps the page working under any real traffic.
 *
 * Setting POKEMONTCG_API_KEY (free, dev.pokemontcg.io) raises the ceiling to
 * 20,000/day. The budget below scales with it.
 */
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — upstream refreshes daily
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // serve stale this long if upstream dies
const MAX_ENTRIES = 500;

type Entry = { at: number; cards: PriceCard[]; total: number };
const cache = new Map<string, Entry>();

const hasKey = () => Boolean(process.env.POKEMONTCG_API_KEY);
// Documented keyless ceiling is 1,000/day and 30/minute. Stay under both,
// remembering that one visitor search can cost up to ATTEMPTS upstream calls.
const dayBudget = () => (hasKey() ? 15000 : 800);
const minuteBudget = () => (hasKey() ? 100 : 25);

let dayCount = 0;
let dayStamp = 0;
let minCount = 0;
let minStamp = 0;

function takeBudget(now: number): boolean {
  const day = Math.floor(now / 86_400_000);
  const min = Math.floor(now / 60_000);
  if (day !== dayStamp) {
    dayStamp = day;
    dayCount = 0;
  }
  if (min !== minStamp) {
    minStamp = min;
    minCount = 0;
  }
  if (dayCount >= dayBudget() || minCount >= minuteBudget()) return false;
  dayCount += 1;
  minCount += 1;
  return true;
}

function put(key: string, cards: PriceCard[], total: number) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.delete(key);
  cache.set(key, { at: Date.now(), cards, total });
}

/** Exported for tests. */
export function _resetForTest() {
  cache.clear();
  dayCount = 0;
  minCount = 0;
  dayStamp = 0;
  minStamp = 0;
}

const FINISH_LABELS: Record<string, string> = {
  normal: "Normal",
  holofoil: "Holofoil",
  reverseHolofoil: "Reverse holo",
  unlimited: "Unlimited",
  unlimitedHolofoil: "Unlimited holo",
  "1stEdition": "1st edition",
  "1stEditionNormal": "1st edition",
  "1stEditionHolofoil": "1st edition holo",
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalize(raw: any): PriceCard | null {
  if (!raw?.id || !raw?.name) return null;

  const prices = raw.tcgplayer?.prices ?? {};
  const finishes: Finish[] = Object.entries(prices)
    .map(([key, p]: [string, any]) => ({
      label: FINISH_LABELS[key] ?? key,
      market: num(p?.market),
      low: num(p?.low),
      high: num(p?.high),
    }))
    // A finish with no market and no low tells a vendor nothing. Drop it
    // rather than render an empty row that looks like a bug.
    .filter((f) => f.market !== null || f.low !== null)
    .sort((a, b) => (b.market ?? b.low ?? 0) - (a.market ?? a.low ?? 0));

  return {
    id: String(raw.id),
    name: String(raw.name),
    setName: String(raw.set?.name ?? "Unknown set"),
    number: String(raw.number ?? "—"),
    rarity: raw.rarity ? String(raw.rarity) : null,
    image: raw.images?.small ? String(raw.images.small) : null,
    url: raw.tcgplayer?.url ? String(raw.tcgplayer.url) : null,
    updatedAt: raw.tcgplayer?.updatedAt ? String(raw.tcgplayer.updatedAt) : null,
    finishes,
  };
}

/**
 * The upstream 500s intermittently on queries it serves fine seconds later.
 * Measured 2026-07-28 over 12 identical calls each: 42% 5xx on a query with
 * results, 33% on a query with none — so it is the API being flaky, not
 * anything about the query. Unretried, roughly two searches in five would
 * fail in front of a visitor.
 *
 * Five attempts takes a 42% miss down to ~1%. Most calls succeed on the
 * first or second try, so the average cost is well under five requests.
 */
const ATTEMPTS = 5;
const BACKOFF_MS = 300;

/**
 * Upstream sorts newest-first, and the newest set is exactly the one TCGplayer
 * has not priced yet — so a raw "charizard ex" search led with two cards
 * showing no price at all, which reads as a broken tool. Priced cards first,
 * newest-first within each group.
 */
export function sortForVendors(cards: PriceCard[]): PriceCard[] {
  const priced = cards.filter((c) => c.finishes.length > 0);
  const unpriced = cards.filter((c) => c.finishes.length === 0);
  return [...priced, ...unpriced].slice(0, SHOW_SIZE);
}

type Upstream =
  | { kind: "ok"; cards: PriceCard[]; total: number }
  | { kind: "failed" }
  | { kind: "busy" };

async function fetchUpstream(query: string): Promise<Upstream> {
  const params = new URLSearchParams({
    q: query,
    pageSize: String(FETCH_SIZE),
    orderBy: "-set.releaseDate",
    select: "id,name,number,rarity,set,images,tcgplayer",
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.POKEMONTCG_API_KEY;
  if (key) headers["X-Api-Key"] = key;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (!takeBudget(Date.now())) return { kind: "busy" };
    try {
      const res = await fetch(url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = await res.json();
        const all = (json?.data ?? []).map(normalize).filter(Boolean) as PriceCard[];
        return { kind: "ok", cards: sortForVendors(all), total: Number(json?.totalCount ?? all.length) };
      }
      // 4xx is our fault and will not fix itself on retry.
      if (res.status < 500) return { kind: "failed" };
    } catch {
      // network error / timeout — fall through to the next attempt
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, BACKOFF_MS));
  }
  return { kind: "failed" };
}

export async function searchCards(rawQuery: string): Promise<SearchResult> {
  const key = normalizeKey(rawQuery);
  if (key.length < 2) return { ok: false, error: "empty_query" };

  const query = buildQuery(key);
  if (!query) return { ok: false, error: "empty_query" };

  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) {
    return { ok: true, cards: hit.cards, total: hit.total, stale: false };
  }

  const fresh = await fetchUpstream(query);
  if (fresh.kind === "ok") {
    put(key, fresh.cards, fresh.total);
    return { ok: true, cards: fresh.cards, total: fresh.total, stale: false };
  }

  // Upstream failed or we are out of budget. A stale price beats no price for
  // someone standing at a table, as long as we say it is stale.
  if (hit && now - hit.at < STALE_MS) {
    return { ok: true, cards: hit.cards, total: hit.total, stale: true };
  }

  return { ok: false, error: fresh.kind === "busy" ? "busy" : "upstream" };
}
