/* Unit tests for Show mode: the offline queue, the pack, and the validation
 * every queued sale is re-checked against on the server.
 * Run: npm run test:show   (cwd = vendor-starter-hub)
 *
 * The rule these exist to defend: a sale that happened in the real world must
 * never be lost, and a cached price must never be presented as a live one.
 */

import {
  describeAge, isStale, logTotals, matchItem, mergeSyncResults, nextAttemptDelayMs,
  packAge, payUpTo, pruneLog, queueSummary, round2, saleTotals, sortItems, syncBatch,
  LOG_KEEP_MS, STALE_AFTER_MS,
  type LogEntry, type PackItem, type PackWatch, type QueuedSale, type SyncResult,
} from "../lib/showpack";
import { MAX_BATCH, isRetryable, parseQueuedSale } from "../lib/sale-sync";

let pass = 0;
const fails: string[] = [];

function ok(cond: boolean, what: string) {
  if (cond) pass++;
  else fails.push(what);
}
function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++;
  else fails.push(`${what}\n      expected ${e}\n      got      ${a}`);
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const sale = (over: Partial<QueuedSale> = {}): QueuedSale => ({
  ref: UUID(1), createdAt: "2026-07-28T18:00:00.000Z", soldAt: "2026-07-28T18:00:00.000Z",
  itemId: null, itemName: "Charizard ex", category: "single", quantity: 1,
  salePrice: 100, costBasis: 40, fees: 0, channel: "show",
  showId: null, customerId: null, notes: null, attempts: 0, lastError: null,
  ...over,
});

const item = (over: Partial<PackItem> = {}): PackItem => ({
  id: UUID(9), name: "Umbreon VMAX", set_name: "Evolving Skies", category: "single",
  condition: "NM", quantity: 3, cost_basis: 200, asking_price: 320, ...over,
});

/* ================= money ================= */

eq(round2(0.1 + 0.2), 0.3, "floating point noise is rounded away");
eq(saleTotals({ quantity: 3, salePrice: 12.5, costBasis: 4, fees: 1.5 }),
  { gross: 37.5, profit: 24 }, "3 @ 12.50, cost 4, fees 1.50 -> gross 37.50, profit 24");
eq(saleTotals({ quantity: 1, salePrice: 10, costBasis: 25, fees: 0 }).profit, -15,
  "selling below cost is a loss, not zero");
// Fees are per sale, not per unit: charging them per unit would understate
// profit on every multi-card sale of the day.
eq(saleTotals({ quantity: 10, salePrice: 5, costBasis: 2, fees: 3 }).profit, 27,
  "fees are taken once, not once per unit");

/* ================= queue summary ================= */

eq(queueSummary([]), { count: 0, gross: 0, failing: 0 }, "empty queue");
eq(queueSummary([sale({ quantity: 2, salePrice: 30 }), sale({ ref: UUID(2), salePrice: 15 })]),
  { count: 2, gross: 75, failing: 0 }, "gross is quantity-weighted across the queue");
eq(queueSummary([sale({ attempts: 2, lastError: "nope" }), sale({ ref: UUID(2), attempts: 3 })]).failing,
  1, "a row only counts as failing once it has an error, not merely attempts");

/* ================= pack age / staleness ================= */
/* The most important labelling on the page. A stale price you know is stale is
 * useful; one you think is live is how you overpay for a binder. */

const AT = "2026-07-28T12:00:00.000Z";
const T0 = Date.parse(AT);
eq(packAge({ cachedAt: AT }, T0 + 90_000), 90_000, "age is measured from the cache stamp");
eq(packAge({ cachedAt: AT }, T0 - 5_000), 0, "a clock that went backwards reads as 0, never negative");
eq(packAge({ cachedAt: "not a date" }), null, "an unreadable stamp has no age");

eq(describeAge(0), "just now", "under a minute");
eq(describeAge(14 * 60_000), "14 min ago", "minutes");
eq(describeAge(3 * 3600_000), "3 hr ago", "hours");
eq(describeAge(26 * 3600_000), "1 day ago", "singular day");
eq(describeAge(50 * 3600_000), "2 days ago", "plural days");
eq(describeAge(null), "at an unknown time", "never renders a blank or a bare timestamp");

ok(isStale(null), "an unknown age is treated as stale, not as fresh");
ok(!isStale(STALE_AFTER_MS - 1), "just inside the window is fresh");
ok(isStale(STALE_AFTER_MS + 1), "just outside the window is stale");

/* ================= buy ceilings, offline ================= */

const watch = (over: Partial<PackWatch> = {}): PackWatch => ({
  card_id: "sv3pt5-6", card_name: "Charizard ex", set_name: "151", finish_label: "Holofoil",
  market: 335.21, target_kind: "percent", target_price: null, target_pct: 40,
  priced_at: "2026-07-28", ...over,
});

// Same figures the price checker and watchlist were verified against.
eq(payUpTo(watch()), 201.13, "40% under 335.21 = 201.13");
eq(payUpTo(watch({ target_pct: 60 })), 134.08, "60% under 335.21 = 134.08");
eq(payUpTo(watch({ target_kind: "price", target_price: 120, target_pct: null })), 120,
  "a fixed ceiling is the ceiling");
eq(payUpTo(watch({ target_kind: "price", target_price: 120, target_pct: null, market: null })), 120,
  "a fixed ceiling survives having no cached market price");
// The dangerous case: no price must mean no answer, never $0 — a $0 ceiling
// rendered as a number is an instruction to pay nothing for a $300 card.
eq(payUpTo(watch({ market: null })), null, "a percent target with no cached price has NO ceiling");
eq(payUpTo(watch({ market: 42.5 })), 25.5, "the ceiling follows the finish's own price");

/* ================= sell list ================= */

eq(matchItem(item(), "umb"), true, "prefix of the name matches");
eq(matchItem(item(), "UMBREON"), true, "case is ignored");
eq(matchItem(item(), "umb evolv"), true, "words may come from name and set together");
eq(matchItem(item(), "umb sky"), false,
  "matching is substring, not fuzzy — 'sky' does not find 'Skies', which is why the placeholder asks for the first letters of the name");
eq(matchItem(item(), "umb charizard"), false, "every word must match, not any");
eq(matchItem(item(), "   "), true, "whitespace is not a filter");
eq(matchItem(item({ condition: "LP" }), "lp"), true, "condition is searchable");

{
  const sorted = sortItems([
    item({ id: UUID(1), name: "Zapdos", quantity: 2 }),
    item({ id: UUID(2), name: "Alakazam", quantity: 0 }),
    item({ id: UUID(3), name: "Blastoise", quantity: 1 }),
  ]);
  eq(sorted.map((i) => i.name), ["Blastoise", "Zapdos", "Alakazam"],
    "in stock first, alphabetical within, sold-out last");
  // Sold-out rows stay visible: you can sell something the count says you do
  // not have, and hiding it is how a wrong count goes unnoticed.
  eq(sorted.length, 3, "a sold-out item is never hidden from the list");
}

/* ================= merging the server's answer ================= *
 * The single most consequential function in Show mode. Every branch here is a
 * decision about somebody's money.                                          */

{
  const q = [sale({ ref: UUID(1) }), sale({ ref: UUID(2) }), sale({ ref: UUID(3) })];
  const results: SyncResult[] = [
    { ref: UUID(1), ok: true, id: "s1", oversold: false },
    { ref: UUID(2), ok: false, error: "Item not found", retryable: false },
  ];
  const m = mergeSyncResults(q, results);
  eq(m.synced, 1, "an accepted sale counts as synced");
  eq(m.queue.map((s) => s.ref), [UUID(2), UUID(3)], "accepted leaves the queue; rejected does not");
  eq(m.queue[0].attempts, 1, "a rejection increments that row's attempt count");
  eq(m.queue[0].lastError, "Item not found", "the reason is kept on the row for the vendor to read");
  eq(m.queue[1].attempts, 0, "a row the server said nothing about is left exactly as it was");
  eq(m.failed.length, 1, "failures are reported back to the UI");
}
{
  // The rule that protects real money: the server rejecting a sale must never
  // make it disappear. Only the vendor can decide to drop one.
  const m = mergeSyncResults([sale({ ref: UUID(1) })],
    [{ ref: UUID(1), ok: false, error: "boom", retryable: true }]);
  eq(m.queue.length, 1, "a rejected sale is NEVER silently dropped");
  eq(m.synced, 0, "and it is not counted as synced");
}
{
  const m = mergeSyncResults([sale({ ref: UUID(1), itemName: "Pikachu" })],
    [{ ref: UUID(1), ok: true, id: "s1", oversold: true }]);
  eq(m.oversold, ["Pikachu"], "an oversell is surfaced by name so the count can be corrected");
  eq(m.queue.length, 0, "but the sale still leaves the queue — it was recorded");
}
{
  // A duplicate is reported by the RPC as a success, because the sale is
  // already in the books. Re-sending after a request died mid-flight must
  // therefore clear the device, not double-log.
  const m = mergeSyncResults([sale({ ref: UUID(1) })],
    [{ ref: UUID(1), ok: true, id: "already-there", oversold: false }]);
  eq(m.queue.length, 0, "a retry of an already-landed sale clears the queue");
}
{
  const m = mergeSyncResults([sale({ ref: UUID(1) })],
    [{ ref: UUID(7), ok: true, id: "x", oversold: false }]);
  eq(m.queue.length, 1, "an answer about a sale we do not have changes nothing");
  eq(m.synced, 0, "and cannot inflate the synced count");
}
eq(mergeSyncResults([], []).queue, [], "empty in, empty out");

/* ================= retry pacing ================= */

eq(nextAttemptDelayMs(0), 2_000, "first retry is quick — wifi flickers back");
eq(nextAttemptDelayMs(3), 16_000, "backs off exponentially");
ok(nextAttemptDelayMs(20) === 60_000, "capped at a minute, so a show never waits an hour");
eq(nextAttemptDelayMs(-5), 2_000, "a nonsense attempt count cannot produce a nonsense delay");

{
  // Least-tried first. Otherwise a few permanently-rejected rows sit at the
  // front and eat the whole batch forever, and a sale from ten minutes ago
  // never gets sent.
  const many = Array.from({ length: 5 }, (_, i) =>
    sale({ ref: UUID(i + 1), attempts: i === 0 ? 9 : 0 }));
  const batch = syncBatch(many, 3);
  eq(batch.length, 3, "batch is capped");
  ok(!batch.some((s) => s.ref === UUID(1)), "the row that keeps failing does not starve the rest");
  eq(syncBatch(many, 99).length, 5, "a queue inside the cap is sent whole, in order");
  eq(syncBatch(many, 99)[0].ref, UUID(1), "and is not needlessly reordered");
}

/* ================= the day's ledger ================= */

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  ref: UUID(1), at: AT, itemName: "Charizard ex", quantity: 1, gross: 100, profit: 60, ...over,
});

eq(logTotals([entry(), entry({ ref: UUID(2), quantity: 2, gross: 50, profit: -5 })]),
  { sales: 2, units: 3, gross: 150, profit: 55 }, "the day totals up");
eq(logTotals([]), { sales: 0, units: 0, gross: 0, profit: 0 }, "an empty day is zeros, not blanks");

{
  const now = T0 + LOG_KEEP_MS + 60_000;
  const kept = pruneLog([entry({ ref: UUID(1) }), entry({ ref: UUID(2), at: new Date(now).toISOString() })], now);
  eq(kept.map((e) => e.ref), [UUID(2)], "yesterday's show drops off after a day and a half");
  // Showing one row too many beats losing one from the day's takings.
  eq(pruneLog([entry({ at: "garbage" })], now).length, 1, "an unreadable stamp is kept, not dropped");
}

/* ================= server-side validation of queued sales ================= *
 * These rows sat in localStorage on a phone. Everything is user input.       */

const good = {
  ref: UUID(1), itemId: null, itemName: "Charizard ex", category: "single", quantity: 2,
  salePrice: 120.5, costBasis: 40, fees: 3, channel: "show",
  showId: null, customerId: null, soldAt: AT, notes: null,
};
const parsed = parseQueuedSale(good);
ok(parsed.ok, "a well-formed quick sale is accepted");
if (parsed.ok) {
  eq(parsed.row.p_quantity, 2, "quantity carries through");
  eq(parsed.row.p_sale_price, 120.5, "price carries through");
  eq(parsed.row.p_item_name, "Charizard ex", "a quick sale keeps its typed name");
}

{
  // An inventory-linked sale must take its name and category from the item,
  // server-side. Otherwise a tampered device could rename or recategorise
  // stock through the sync endpoint.
  const r = parseQueuedSale({ ...good, itemId: UUID(5), itemName: "Renamed", category: "slab" });
  ok(r.ok, "an inventory-linked sale is accepted");
  if (r.ok) {
    eq(r.row.p_item_name, null, "a device cannot rename an inventory item through sync");
    eq(r.row.p_item_id, UUID(5), "the item reference is what is trusted");
  }
}

ok(!parseQueuedSale({ ...good, ref: "not-a-uuid" }).ok, "a bad ref is rejected");
ok(!parseQueuedSale({ ...good, ref: "" }).ok, "a blank ref is rejected");
ok(!parseQueuedSale({ ...good, ref: "1 OR 1=1" }).ok, "a ref cannot smuggle SQL");
ok(!parseQueuedSale({ ...good, itemId: "'; drop table sales;--" }).ok, "an item id cannot smuggle SQL");
ok(!parseQueuedSale({ ...good, customerId: "abc" }).ok, "a malformed customer id is rejected");
ok(!parseQueuedSale({ ...good, showId: "abc" }).ok, "a malformed show id is rejected");
eq(parseQueuedSale({ ...good, showId: "" }).ok, true, "an empty optional id means 'not set', not 'invalid'");

ok(!parseQueuedSale({ ...good, itemName: "  " }).ok, "no item and no name is not a sale");
ok(!parseQueuedSale({ ...good, quantity: 0 }).ok, "zero quantity rejected");
ok(!parseQueuedSale({ ...good, quantity: -3 }).ok, "negative quantity rejected");
ok(!parseQueuedSale({ ...good, quantity: 99_999 }).ok, "absurd quantity rejected");
ok(!parseQueuedSale({ ...good, quantity: "many" }).ok, "non-numeric quantity rejected");
ok(!parseQueuedSale({ ...good, salePrice: -1 }).ok, "a negative price is rejected");
ok(!parseQueuedSale({ ...good, salePrice: 2_000_000 }).ok, "an absurd price is rejected");
ok(!parseQueuedSale({ ...good, salePrice: "free" }).ok, "a non-numeric price is rejected");
eq(parseQueuedSale({ ...good, salePrice: 0 }).ok, true, "a $0 sale is legitimate — giveaways happen");
ok(!parseQueuedSale({ ...good, channel: "carrier-pigeon" }).ok, "an unknown channel is rejected");
ok(!parseQueuedSale(null).ok, "null is not a sale");
ok(!parseQueuedSale("sale").ok, "a string is not a sale");

{
  const r = parseQueuedSale({ ...good, category: "nonsense" });
  ok(r.ok, "an unknown category does not fail the row");
  // Failing here would strand a real sale over a cosmetic field; the DB check
  // constraint is what would actually reject it, mid-batch.
  if (r.ok) eq(r.row.p_category, "other", "it is recorded as 'other' instead");
}
{
  const r = parseQueuedSale({ ...good, soldAt: "whenever" });
  ok(r.ok, "an unreadable timestamp does not lose the sale");
  if (r.ok) ok(Number.isFinite(Date.parse(r.row.p_sold_at)), "it is stamped with now instead");
}
{
  const r = parseQueuedSale({ ...good, itemName: "x".repeat(500), notes: "y".repeat(9_000) });
  ok(r.ok, "long text is trimmed rather than rejected");
  if (r.ok) {
    eq(r.row.p_item_name?.length, 200, "name capped at 200");
    eq(r.row.p_notes?.length, 500, "notes capped at 500");
  }
}
{
  const r = parseQueuedSale({ ...good, costBasis: "junk", fees: null });
  ok(r.ok, "unusable cost and fees do not lose the sale");
  if (r.ok) {
    eq(r.row.p_cost_basis, 0, "cost falls back to 0");
    eq(r.row.p_fees, 0, "fees fall back to 0");
  }
}

eq(MAX_BATCH, 100, "the batch cap the client and server agree on");

/* ---- retryable classification ---- */
ok(!isRetryable("42501", "permission denied"), "an RLS denial will not fix itself");
ok(!isRetryable("PGRST301", "JWT expired"), "an auth failure is not retried in a loop");
ok(!isRetryable("23503", "foreign key violation"), "a deleted item will never accept the sale");
ok(!isRetryable("23514", "check constraint"), "a constraint violation is permanent");
ok(!isRetryable(undefined, "Item not found"), "a missing item is permanent");
ok(isRetryable(undefined, "fetch failed"), "an unknown failure is assumed to be a blip");
ok(isRetryable("57014", "statement timeout"), "a timeout is worth trying again");

/* ================= summary ================= */
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL: " + f);
  process.exit(1);
}
