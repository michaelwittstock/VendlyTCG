/* Unit tests for the watchlist maths and the price-module helpers.
 * Run: npm run test:unit   (cwd = vendor-starter-hub)
 * A clean type-check only proves it compiles. These check the numbers. */

import {
  validateTarget, ceiling, status, drift, sortKey,
  type WatchTarget,
} from "../lib/watchlist";
import {
  isCardId, chunk, pickFinish, referencePrice,
  type PriceCard,
} from "../lib/prices";

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

const P = (price: number): WatchTarget =>
  ({ target_kind: "price", target_price: price, target_pct: null });
const C = (pct: number): WatchTarget =>
  ({ target_kind: "percent", target_price: null, target_pct: pct });

/* ---------------- validateTarget ---------------- */
eq(validateTarget(P(120)), null, "valid fixed price accepted");
eq(validateTarget(C(40)), null, "valid percent accepted");
eq(validateTarget(C(0)), null, "0% accepted (boundary)");
eq(validateTarget(C(95)), null, "95% accepted (boundary)");
ok(validateTarget(C(96)) !== null, "96% rejected");
ok(validateTarget(C(-1)) !== null, "negative % rejected");
ok(validateTarget(P(0)) !== null, "$0 ceiling rejected");
ok(validateTarget(P(-5)) !== null, "negative ceiling rejected");
ok(validateTarget(P(2_000_000)) !== null, "absurd ceiling rejected");
ok(validateTarget({ target_kind: "price", target_price: null, target_pct: 40 }) !== null,
  "kind=price with only a % rejected");
ok(validateTarget({ target_kind: "percent", target_price: 40, target_pct: null }) !== null,
  "kind=percent with only a $ rejected");
ok(validateTarget(P(NaN)) !== null, "NaN ceiling rejected");
ok(validateTarget(C(NaN)) !== null, "NaN percent rejected");

/* ---------------- ceiling ---------------- */
// The price checker's verified figures: $335.21 market, 40% -> 201.13, 60% -> 134.08.
eq(ceiling(C(40), 335.21), 201.13, "40% under 335.21 = 201.13");
eq(ceiling(C(60), 335.21), 134.08, "60% under 335.21 = 134.08");
eq(ceiling(C(0), 50), 50, "0% under market = market");
eq(ceiling(C(40), null), null, "percent target with no market has no ceiling");
eq(ceiling(P(120), null), 120, "fixed ceiling survives a missing market");
eq(ceiling(P(120), 900), 120, "fixed ceiling ignores market");
eq(ceiling(C(33), 10), 6.7, "rounds to cents (10 * 0.67)");

/* ---------------- status ---------------- */
eq(status(C(40), null), { kind: "no_price" }, "no market -> no_price");
eq(status(C(40), 0), { kind: "no_price" }, "zero market -> no_price");
eq(status(P(120), null), { kind: "no_price" }, "fixed target still needs a market to compare");
eq(status(C(40), 335.21),
  { kind: "pay_up_to", market: 335.21, ceiling: 201.13, pct: 40 },
  "percent target reports pay_up_to, never a trigger");
eq(status(P(120), 100),
  { kind: "in_range", market: 100, ceiling: 120, under: 20 },
  "market below fixed ceiling -> in_range");
eq(status(P(120), 120),
  { kind: "in_range", market: 120, ceiling: 120, under: 0 },
  "market exactly at ceiling counts as in range");
eq(status(P(100), 150),
  { kind: "above", market: 150, ceiling: 100, over: 50, overPct: 50 },
  "market above fixed ceiling -> above, with % over the ceiling");

/* ---------------- drift ---------------- */
eq(drift(90, 100), { abs: -10, pct: -10 }, "10% drop since added");
eq(drift(110, 100), { abs: 10, pct: 10 }, "10% rise since added");
eq(drift(100, 100), { abs: 0, pct: 0 }, "flat");
eq(drift(null, 100), null, "no market -> no drift");
eq(drift(100, null), null, "no baseline -> no drift");
eq(drift(100, 0), null, "zero baseline is not a divisor");

/* ---------------- sortKey ---------------- */
{
  const rows = [
    status(C(40), 100),            // pay_up_to
    status(P(100), 150),           // above by 50%
    status(P(100), 90),            // in_range by 10
    status(P(100), null),          // no_price
    status(P(100), 120),           // above by 20%
    status(P(100), 50),            // in_range by 50
  ];
  const order = rows
    .map((s, i) => [i, sortKey(s)] as const)
    .sort((a, b) => (a[1][0] !== b[1][0] ? a[1][0] - b[1][0] : a[1][1] - b[1][1]))
    .map(([i]) => rows[i].kind);
  eq(order,
    ["in_range", "in_range", "above", "above", "pay_up_to", "no_price"],
    "buyable first, then closest to buyable, then live figures, then unknown");
  // and within in_range, the deepest discount leads
  const inRange = rows.filter((r) => r.kind === "in_range") as Extract<ReturnType<typeof status>, { kind: "in_range" }>[];
  const deepest = [...inRange].sort((a, b) => sortKey(a)[1] - sortKey(b)[1])[0];
  eq(deepest.under, 50, "deepest discount sorts first within in_range");
}

/* ---------------- isCardId ---------------- *
 * This is the guard between our database and an upstream query string. A row
 * gets there from a form, so it is user input no matter where the form got it. */
for (const good of ["sv3pt5-6", "base1-4", "swsh12pt5-160", "xy7-54", "sm115-14", "ex12-102"])
  ok(isCardId(good), `accepts real card id ${good}`);

for (const bad of [
  "",                       // empty
  " ",                      // whitespace
  "base1 4",                // space
  "id:base1-4",             // already-formed query syntax
  'x" OR "1"="1',           // injection attempt
  "base1-4 OR id:base1-5",  // OR smuggled in
  "*",                      // wildcard
  "name:charizard*",        // a search, not an id
  "base1-",                 // trailing separator, no suffix
  "-4",                     // leading separator
  "base1_4",                // wrong separator
  "base1-4;drop",           // punctuation
  "x".repeat(65),           // over the DB length cap
])
  ok(!isCardId(bad), `rejects ${JSON.stringify(bad)}`);

/* ---------------- chunk ---------------- *
 * Upstream 400s on very long id queries, so batch size is load-bearing. */
eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], "chunks with a short tail");
eq(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]], "chunks evenly");
eq(chunk([], 20), [], "empty input -> no batches");
eq(chunk([1], 20), [[1]], "single item -> one batch");
eq(chunk(Array.from({ length: 41 }, (_, i) => i), 20).map((b) => b.length),
  [20, 20, 1], "41 ids -> three batches, none over 20");

/* ---------------- pickFinish / referencePrice ---------------- */
const card = (finishes: PriceCard["finishes"]): PriceCard => ({
  id: "sv3pt5-6", name: "Charizard ex", setName: "151", number: "6",
  rarity: "Double Rare", image: null, url: null, updatedAt: "2026/07/28", finishes,
});
const holo = { label: "Holofoil", market: 335.21, low: 300, high: 400 };
const rev = { label: "Reverse holo", market: 42.5, low: 40, high: 50 };
const noMarket = { label: "Normal", market: null, low: 12.75, high: 20 };

eq(pickFinish(card([holo, rev]), null), holo,
  "null finish means the highest-value printing, not an average");
eq(pickFinish(card([holo, rev]), "Reverse holo"), rev, "named finish picked exactly");
eq(pickFinish(card([holo, rev]), "1st edition"), null,
  "a finish the card no longer publishes returns null, not a fallback to other money");
eq(pickFinish(card([]), null), null, "card with no priced finishes -> null");
eq(pickFinish(undefined, null), null, "missing card -> null");
eq(pickFinish(undefined, "Holofoil"), null, "missing card with named finish -> null");

eq(referencePrice(holo), 335.21, "market price preferred");
eq(referencePrice(noMarket), 12.75, "falls back to low when market is unpublished");
eq(referencePrice({ label: "x", market: null, low: null, high: 9 }), null,
  "high alone is not a reference price");
eq(referencePrice(null), null, "no finish -> no price");

/* ---------------- end-to-end of the maths, on a real card ---------------- *
 * Guards the whole chain: a watch pinned to reverse holo must not be judged
 * on the holo price. Getting this wrong would tell a vendor to pay 8x. */
{
  const c = card([holo, rev]);
  const revPrice = referencePrice(pickFinish(c, "Reverse holo"));
  eq(revPrice, 42.5, "reverse holo resolves to its own price");
  eq(status(C(40), revPrice), { kind: "pay_up_to", market: 42.5, ceiling: 25.5, pct: 40 },
    "40% under the reverse holo is 25.50, not 201.13");
  const bestPrice = referencePrice(pickFinish(c, null));
  eq(status(C(40), bestPrice).kind === "pay_up_to" && (status(C(40), bestPrice) as { ceiling: number }).ceiling,
    201.13, "same watch on the best finish is 201.13");
}

/* ---------------- summary ---------------- */
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL: " + f);
  process.exit(1);
}
