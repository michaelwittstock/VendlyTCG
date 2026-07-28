/* Integration tests for getCardsByIds against the real upstream API.
 * Run: npm run test:live   (cwd = vendor-starter-hub)
 *
 * These hit api.pokemontcg.io. They are slow and they consume the shared
 * request budget, which is why they are a separate script from the unit
 * tests and not part of the build.
 */

import { getCardsByIds, pickFinish, referencePrice, _resetForTest } from "../lib/prices";

let pass = 0;
const fails: string[] = [];
const ok = (c: boolean, w: string) => (c ? pass++ : fails.push(w));
const eq = (a: unknown, e: unknown, w: string) =>
  JSON.stringify(a) === JSON.stringify(e)
    ? pass++
    : fails.push(`${w}\n      expected ${JSON.stringify(e)}\n      got      ${JSON.stringify(a)}`);

/* Count upstream calls by wrapping fetch. Batching is the whole point of this
 * function — a watchlist that made one call per row would exhaust a 1,000/day
 * keyless budget at ~80 page views. */
const realFetch = globalThis.fetch;
let calls = 0;
let lastUrls: string[] = [];
globalThis.fetch = ((...args: Parameters<typeof realFetch>) => {
  calls++;
  lastUrls.push(String(args[0]));
  return realFetch(...args);
}) as typeof realFetch;
const reset = () => {
  calls = 0;
  lastUrls = [];
};

const REAL = [
  "base1-4", "sv3pt5-6", "swsh4-25", "xy7-54", "sm115-14", "base1-2",
  "base1-15", "sv1-245", "sv2-197", "swsh12pt5-160", "base2-4", "neo1-9",
  "dp1-4", "hgss1-1", "bw1-1", "xy1-1", "sm1-1", "swsh1-1", "sv3-125", "sv4-1",
  "base1-58", "base1-60", "base2-10", "neo1-4", "xy1-4",
];
const FAKE = "zzz9999-99999";

async function main() {
  /* --- 1. a 25-id request batches into 2 calls, not 25 --- */
  _resetForTest();
  reset();
  const t0 = Date.now();
  const big = await getCardsByIds(REAL);
  const coldMs = Date.now() - t0;
  ok(calls >= 2 && calls <= 2 * 5,
    `25 ids batched into 2 upstream requests (allowing retries) — made ${calls}`);
  ok(big.cards.size >= 20, `resolved most of 25 real ids — got ${big.cards.size}`);
  ok(lastUrls.every((u) => !u.includes(" ")), "query strings are encoded, never raw");

  /* --- 2. second identical request is served from cache: zero network --- */
  reset();
  const t1 = Date.now();
  const again = await getCardsByIds(REAL);
  const warmMs = Date.now() - t1;
  eq(calls, 0, "repeat lookup makes no upstream request");
  eq(again.cards.size, big.cards.size, "cache returns the same set");
  ok(warmMs < coldMs, `cached lookup faster than cold (${warmMs}ms vs ${coldMs}ms)`);

  /* --- 3. an id the provider does not have is absent, never $0 --- */
  _resetForTest();
  reset();
  const missing = await getCardsByIds(["base1-4", FAKE]);
  ok(missing.cards.has("base1-4"), "real id in a mixed batch still resolves");
  ok(!missing.cards.has(FAKE), "unknown id is absent from the result");
  eq(missing.stale.has(FAKE), false, "unknown id is not reported as stale");
  eq(missing.unresolved.get(FAKE), "not_found",
    "an id the provider answered about and does not have is 'not_found'");
  eq(missing.degraded, false, "a successful lookup with a missing id is not 'degraded'");

  /* --- 3b. a lookup we could not perform is 'unavailable', NOT 'not_found' --- *
   * These are different sentences to the person reading the screen, and only
   * one of them means their watch is broken. */
  _resetForTest();
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("simulated outage"))) as typeof fetch;
  const down = await getCardsByIds(["base1-4"]);
  globalThis.fetch = savedFetch;
  eq(down.cards.size, 0, "an outage yields no cards");
  eq(down.degraded, true, "an outage sets degraded");
  eq(down.unresolved.get("base1-4"), "unavailable",
    "an unreachable provider reports 'unavailable', never 'not_found'");

  /* --- 3c. during an outage a cached copy is served, and flagged stale --- */
  _resetForTest();
  await getCardsByIds(["base1-4"]);                 // warm the cache
  const stamp = Date.now();
  globalThis.fetch = (() => Promise.reject(new Error("simulated outage"))) as typeof fetch;
  // force a miss by ageing nothing — instead ask for a second id that is not cached
  const mixed = await getCardsByIds(["base1-4", "base1-15"]);
  globalThis.fetch = savedFetch;
  ok(mixed.cards.has("base1-4"), "cached card still served during an outage");
  eq(mixed.unresolved.get("base1-15"), "unavailable", "uncached card during an outage is 'unavailable'");
  ok(Date.now() - stamp < 60_000, "outage path fails fast rather than hanging");

  /* --- 4. ids that are not ids never reach the query --- */
  _resetForTest();
  reset();
  const dirty = await getCardsByIds(['x" OR "1"="1', "id:base1-4", "*", "name:charizard*"]);
  eq(dirty.cards.size, 0, "no results from junk ids");
  eq(calls, 0, "junk ids are filtered before any request is made");

  /* --- 5. duplicate ids are de-duplicated --- */
  _resetForTest();
  reset();
  await getCardsByIds(["base1-4", "base1-4", "base1-4"]);
  ok(lastUrls[0]?.split("id%3A").length === 2,
    "duplicate ids collapse to one term in the query");

  /* --- 6. finishes really do arrive sorted most-valuable-first --- *
   * pickFinish(card, null) trusts that ordering. If upstream stopped
   * honouring it, "highest-value finish" would quietly become "first finish
   * the API happened to return". */
  _resetForTest();
  const multi = await getCardsByIds(["swsh4-25", "sv3pt5-6", "base1-4", "xy7-54"]);
  let checked = 0;
  for (const card of multi.cards.values()) {
    if (card.finishes.length < 2) continue;
    checked++;
    const vals = card.finishes.map((f) => f.market ?? f.low ?? 0);
    const sorted = [...vals].sort((a, b) => b - a);
    eq(vals, sorted, `${card.name}: finishes sorted most-valuable-first`);
    eq(pickFinish(card, null), card.finishes[0], `${card.name}: null finish = top finish`);
    ok(referencePrice(pickFinish(card, null))! >=
       referencePrice(card.finishes[card.finishes.length - 1])!,
      `${card.name}: top finish is not cheaper than the bottom one`);
  }
  ok(checked > 0, `at least one multi-finish card was available to check (${checked})`);

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    for (const f of fails) console.log("  FAIL: " + f);
    process.exit(1);
  }
}

main();
