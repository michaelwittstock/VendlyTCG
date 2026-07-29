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
import {
  trend, sparkPath, groupHistory, historyKey,
} from "../lib/price-history";
import {
  shouldRaise, ceilingFor, insideCeiling, alertLine, digest,
} from "../lib/alerts";
import { readFileSync } from "node:fs";

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

/* ---------------- price history / trend ---------------- */
{
  const pts = (...xs: [string, number][]) => xs.map(([day, price]) => ({ day, price }));

  const empty = trend([], 50);
  eq(empty.days, 0, "no recorded days -> zero days");
  eq(empty.average, null, "no recorded days -> no average (not 0)");
  eq(empty.vsAverage, null, "no recorded days -> nothing to compare against");

  // Deliberately out of order and with a junk row: the job upserts by day, but
  // nothing guarantees the rows come back sorted, and a zero price would drag
  // an average toward a number no card ever sold at.
  const t = trend(
    pts(["2026-07-03", 30], ["2026-07-01", 10], ["2026-07-02", 20], ["2026-07-04", 0]),
    15,
  );
  eq(t.days, 3, "non-positive prices are dropped, not averaged in");
  eq(t.points[0].day, "2026-07-01", "points come back oldest first");
  eq(t.average, 20, "average of 10/20/30");
  eq(t.low, 10, "low");
  eq(t.high, 30, "high");
  eq(t.vsAverage, { abs: -5, pct: -25 }, "market 15 is 25% under the 20 average");
  eq(t.change, { abs: 20, pct: 200 }, "change is measured oldest to newest");

  // Today is compared against the past, never folded into it — otherwise the
  // comparison drags itself toward zero difference and stops meaning anything.
  eq(trend(pts(["2026-07-01", 10]), 10).days, 1, "a single day is still one day");
  eq(trend(pts(["2026-07-01", 10]), 10).average, 10, "average of one day is that day");
  eq(trend(pts(["2026-07-01", 10]), 10).change, null, "one day is a dot, not a change");

  eq(trend(pts(["2026-07-01", 10], ["2026-07-02", 12]), null).vsAverage, null,
    "no market price today -> no comparison, rather than a fake 0%");

  /* sparkPath */
  eq(sparkPath([], 60, 20), "", "no points -> no line");
  eq(sparkPath(pts(["2026-07-01", 10]), 60, 20), "", "one point -> no line drawn");
  ok(!sparkPath(pts(["2026-07-01", 10], ["2026-07-02", 20]), 60, 20).includes("NaN"),
    "two points produce a real path");
  {
    // A flat series has zero range; scaling to it would divide by zero.
    const flat = sparkPath(pts(["2026-07-01", 5], ["2026-07-02", 5]), 60, 20);
    ok(!flat.includes("NaN"), "flat series does not divide by zero");
    ok(flat.includes("10.0"), "flat series is drawn down the middle");
  }

  /* groupHistory */
  {
    const g = groupHistory([
      { card_id: "sv3pt5-6", finish: "Holofoil",    day: "2026-07-01", market: 100, low: 90 },
      { card_id: "sv3pt5-6", finish: "Reverse holo", day: "2026-07-01", market: null, low: 12 },
      { card_id: "sv3pt5-6", finish: "Normal",      day: "2026-07-01", market: null, low: null },
    ]);
    eq(g.get(historyKey("sv3pt5-6", "Holofoil"))?.[0].price, 100, "market is preferred");
    eq(g.get(historyKey("sv3pt5-6", "Reverse holo"))?.[0].price, 12, "falls back to low");
    eq(g.get(historyKey("sv3pt5-6", "Normal")), undefined, "priceless day is not a point");
    // The whole reason history is stored per finish: 100 and 12 must never be
    // averaged into a number that describes neither printing.
    ok(g.get(historyKey("sv3pt5-6", "Holofoil")) !== g.get(historyKey("sv3pt5-6", "Reverse holo")),
      "finishes are kept apart");
  }
}

/* ---------------- alert rules ---------------- */
{
  const base = {
    watch_id: "w1", card_id: "sv3pt5-6", card_name: "Charizard ex", finish: "Holofoil",
    market: 80, average: 100, pct_under: 20, recorded_days: 14,
    target_kind: "percent" as const, target_price: null, target_pct: 30,
    last_alert_day: null as string | null, last_alert_pct: null as number | null,
  };

  eq(shouldRaise(base, "2026-07-28").reason, "first", "never alerted -> raise");

  // The rule that decides whether people keep notifications turned on. A card
  // 20% under today is usually still 20% under tomorrow; without this it is a
  // buzz a day for the same non-news.
  eq(shouldRaise({ ...base, last_alert_day: "2026-07-27", last_alert_pct: 20 }, "2026-07-28"),
    { raise: false, reason: "in_cooldown" }, "same news the next day stays quiet");
  eq(shouldRaise({ ...base, last_alert_day: "2026-07-26", last_alert_pct: 20, pct_under: 24 }, "2026-07-28").raise,
    false, "4 points deeper is not enough to break the cooldown");
  eq(shouldRaise({ ...base, last_alert_day: "2026-07-26", last_alert_pct: 20, pct_under: 25 }, "2026-07-28"),
    { raise: true, reason: "deeper" }, "5 points deeper is genuinely new and speaks");
  eq(shouldRaise({ ...base, last_alert_day: "2026-07-21", last_alert_pct: 20 }, "2026-07-28"),
    { raise: true, reason: "cooldown_expired" }, "7 days later it may speak again");
  eq(shouldRaise({ ...base, last_alert_day: "2026-07-22", last_alert_pct: 20 }, "2026-07-28").raise,
    false, "6 days is still inside the cooldown");

  /* ceilings */
  eq(ceilingFor(base), 56, "30% under an $80 market is a $56 ceiling");
  eq(insideCeiling(base), false, "$80 market is not inside its own $56 ceiling");
  eq(ceilingFor({ ...base, target_kind: "price", target_price: 90, target_pct: null }), 90,
    "a fixed ceiling is the fixed number");
  eq(insideCeiling({ ...base, target_kind: "price", target_price: 90, target_pct: null }), true,
    "$80 is inside a $90 fixed ceiling");

  /* copy — the claim it makes is the whole product risk */
  const line = alertLine(base);
  ok(line.includes("under its 14-day average"), "says what it compared against");
  ok(!/listing|for sale|seller|auction/i.test(line),
    "never implies it saw a listing (it cannot — that needs eBay)");

  /* digest */
  eq(digest([]), null, "nothing to say -> send nothing, not 'no deals today'");
  {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...base, watch_id: `w${i}`, card_name: `Card ${i}`, pct_under: 20 + i,
    }));
    const d = digest(many)!;
    ok(d.title.startsWith("6 cards"), "title counts every card, not just shown ones");
    eq(d.body.split("\n").length, 4, "three lines plus an 'and N more'");
    ok(d.body.includes("Card 5"), "deepest discount is listed first");
    ok(d.body.includes("and 3 more"), "the remainder is acknowledged, not dropped");
  }
  eq(digest([base])!.title, "1 card is down against its own history", "singular reads correctly");
}

/* ---------------- the Edge Function's copy of lib/alerts.ts ---------------- *
 * The alert rules run in two places: the Next app (types, and these tests) and
 * a Deno Edge Function, which cannot import from lib/. The function ships a
 * copy. This is the guard that stops the two drifting, which would show up as
 * notifications that disagree with the screen. */
{
  const a = readFileSync(new URL("../lib/alerts.ts", import.meta.url), "utf8");
  const b = readFileSync(
    new URL("../supabase/functions/alert-digest/alerts.ts", import.meta.url), "utf8");
  ok(a === b,
    "supabase/functions/alert-digest/alerts.ts is out of sync with lib/alerts.ts\n" +
    "      fix: cp lib/alerts.ts supabase/functions/alert-digest/alerts.ts (and redeploy)");
}

/* ---------------- summary ---------------- */
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL: " + f);
  process.exit(1);
}
