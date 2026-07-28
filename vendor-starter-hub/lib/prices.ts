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

/**
 * Separate cache for by-id lookups (the watchlist). Keyed by card id rather
 * than search phrase, so a card watched by three people costs one upstream
 * call, and a watchlist page with 12 cards costs one call, not twelve.
 */
type CardEntry = { at: number; card: PriceCard };
const byId = new Map<string, CardEntry>();
const MAX_CARDS = 2000;

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

function putCard(card: PriceCard) {
  if (byId.size >= MAX_CARDS) {
    const oldest = byId.keys().next().value;
    if (oldest !== undefined) byId.delete(oldest);
  }
  byId.delete(card.id);
  byId.set(card.id, { at: Date.now(), card });
}

/** Exported for tests. */
export function _resetForTest() {
  cache.clear();
  byId.clear();
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

type Raw = { kind: "ok"; json: any } | { kind: "failed" } | { kind: "busy" };

/**
 * One upstream GET with the retry policy. Shared by search and by-id lookup so
 * they cannot drift apart, and so both draw from the same request budget.
 *
 * RETRY POLICY, and why 400 is in it. The original policy was "4xx is our
 * fault, do not retry" — reasonable, and wrong for this API. Measured
 * 2026-07-28 while building the watchlist: an unchanged, valid 20-id query
 * returned 400 twice and 500 twice in five consecutive calls, then 200 on a
 * sixth identical call. A request that succeeds unchanged seconds later was
 * not malformed. So 400 is retried like a 5xx. 401/403 are not — those mean
 * the key is wrong and no amount of retrying fixes it.
 */
async function requestUpstream(params: URLSearchParams): Promise<Raw> {
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
      if (res.ok) return { kind: "ok", json: await res.json() };
      // Auth failures are real and permanent. Everything else here has been
      // observed to be transient on this API.
      if (res.status === 401 || res.status === 403) return { kind: "failed" };
    } catch {
      // network error / timeout — fall through to the next attempt
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, BACKOFF_MS));
  }
  return { kind: "failed" };
}

type Upstream =
  | { kind: "ok"; cards: PriceCard[]; total: number }
  | { kind: "failed" }
  | { kind: "busy" };

async function fetchUpstream(query: string): Promise<Upstream> {
  const raw = await requestUpstream(
    new URLSearchParams({
      q: query,
      pageSize: String(FETCH_SIZE),
      orderBy: "-set.releaseDate",
      select: "id,name,number,rarity,set,images,tcgplayer",
    }),
  );
  if (raw.kind !== "ok") return raw;

  const all = (raw.json?.data ?? []).map(normalize).filter(Boolean) as PriceCard[];
  for (const c of all) putCard(c);
  return {
    kind: "ok",
    cards: sortForVendors(all),
    total: Number(raw.json?.totalCount ?? all.length),
  };
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

/* ------------------------------------------------------------------ *
 * By-id lookup — what the watchlist runs on.
 * ------------------------------------------------------------------ */

/** Upstream rejects very long `id:a OR id:b OR ...` queries; 20 is verified safe. */
const ID_BATCH = 20;
/** Card ids from this provider look like "sv3pt5-6" / "swsh12pt5-160". */
const ID_RE = /^[a-z0-9]+(pt[0-9]+)?-[a-z0-9]+$/i;

export function isCardId(v: string): boolean {
  return v.length > 0 && v.length <= 64 && ID_RE.test(v);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type CardLookup = {
  /** Only ids we could resolve. A missing id is never rendered as "$0". */
  cards: Map<string, PriceCard>;
  /** Ids served from cache older than the TTL because a live lookup failed. */
  stale: Set<string>;
  /**
   * Why an id is not in `cards`, and the distinction matters to the person
   * reading the screen:
   *  - "not_found"   the provider answered and has no such card. The watch is
   *                  genuinely pointing at nothing.
   *  - "unavailable" we could not ask. The watch is fine; we are not.
   * Collapsing these into one "card not found" label tells a vendor their
   * watch is broken when the truth is that a lookup timed out.
   */
  unresolved: Map<string, "not_found" | "unavailable">;
  /** True if at least one batch failed outright — the page should say so. */
  degraded: boolean;
};

/**
 * Look up many cards by id in as few upstream calls as possible.
 *
 * Ids are validated before they are interpolated into the query. They come
 * out of our own database, but that database is written from a form, so they
 * are still user input — an unvalidated id would be query syntax.
 */
export async function getCardsByIds(rawIds: string[]): Promise<CardLookup> {
  const cards = new Map<string, PriceCard>();
  const stale = new Set<string>();
  const unresolved = new Map<string, "not_found" | "unavailable">();
  let degraded = false;

  const ids = Array.from(new Set(rawIds.filter(isCardId)));
  // An id that fails validation is not a card we can ask about.
  for (const raw of rawIds) if (!isCardId(raw)) unresolved.set(raw, "not_found");
  if (ids.length === 0) return { cards, stale, unresolved, degraded };

  const now = Date.now();
  const misses: string[] = [];

  for (const id of ids) {
    const hit = byId.get(id);
    if (hit && now - hit.at < TTL_MS) cards.set(id, hit.card);
    else misses.push(id);
  }
  if (misses.length === 0) return { cards, stale, unresolved, degraded };

  for (const batch of chunk(misses, ID_BATCH)) {
    const raw = await requestUpstream(
      new URLSearchParams({
        q: batch.map((id) => `id:${id}`).join(" OR "),
        pageSize: String(batch.length),
        select: "id,name,number,rarity,set,images,tcgplayer",
      }),
    );

    if (raw.kind === "ok") {
      const found = (raw.json?.data ?? []).map(normalize).filter(Boolean) as PriceCard[];
      for (const c of found) {
        putCard(c);
        cards.set(c.id, c);
      }
      // The provider answered and did not include these ids, so they really
      // are gone (withdrawn card, re-indexed set). Fall through to a cached
      // copy so a watch does not blank out, but never invent a price.
      for (const id of batch) {
        if (cards.has(id)) continue;
        const old = byId.get(id);
        if (old && now - old.at < STALE_MS) {
          cards.set(id, old.card);
          stale.add(id);
        } else {
          unresolved.set(id, "not_found");
        }
      }
      continue;
    }

    // Batch failed or we are out of request budget. A stale price beats a
    // blank row for someone standing at a table, as long as the row says so.
    degraded = true;
    for (const id of batch) {
      const old = byId.get(id);
      if (old && now - old.at < STALE_MS) {
        cards.set(id, old.card);
        stale.add(id);
      } else {
        unresolved.set(id, "unavailable");
      }
    }
  }

  return { cards, stale, unresolved, degraded };
}

/**
 * The finish a watch is judged on.
 *
 * `finish === null` means "whichever printing is worth the most", which is the
 * sane default when you have not decided which version you are hunting.
 * Finishes arrive sorted most-valuable-first from normalize().
 */
export function pickFinish(card: PriceCard | undefined, finish: string | null): Finish | null {
  if (!card || card.finishes.length === 0) return null;
  if (finish === null) return card.finishes[0];
  return card.finishes.find((f) => f.label === finish) ?? null;
}

/** The number to judge against: market if published, otherwise low. */
export function referencePrice(f: Finish | null): number | null {
  if (!f) return null;
  return f.market ?? f.low ?? null;
}
