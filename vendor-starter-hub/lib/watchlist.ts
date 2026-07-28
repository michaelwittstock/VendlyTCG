/**
 * Watchlist target maths.
 *
 * WHAT THIS IS AND IS NOT. v1 watches the MARKET price of a card. It does not
 * scan anyone's listings — that is the deal alert engine, which needs the eBay
 * Browse API and is a separate roadmap row. Saying "alert" here would be a lie
 * the product cannot back up, so nothing in this file claims one.
 *
 * What it honestly does:
 *  - "Buy under $X"  — a fixed ceiling. Market moving down to it is real news,
 *                      because it means the whole card got cheaper.
 *  - "N% under market" — a pay-up-to figure that re-derives itself every time
 *                      market moves. This is the number you say out loud when
 *                      someone opens a binder in front of you. It never
 *                      "triggers", and pretending it does would be noise.
 */

export type TargetKind = "price" | "percent";

export type WatchTarget = {
  target_kind: TargetKind;
  target_price: number | null;
  target_pct: number | null;
};

export const MIN_PCT = 0;
export const MAX_PCT = 95;
export const MAX_PRICE = 1_000_000;

/** Mirrors the DB check constraint. Kept in sync deliberately: the DB is the
 *  backstop, this is what lets the form say something useful before saving. */
export function validateTarget(t: WatchTarget): string | null {
  if (t.target_kind === "price") {
    if (t.target_price === null || !Number.isFinite(t.target_price))
      return "Give the ceiling a dollar amount.";
    if (t.target_price <= 0) return "A buy-under price has to be more than $0.";
    if (t.target_price > MAX_PRICE) return "That ceiling is not a real number.";
    return null;
  }
  if (t.target_pct === null || !Number.isFinite(t.target_pct))
    return "Give the target a percentage.";
  if (t.target_pct < MIN_PCT || t.target_pct > MAX_PCT)
    return `A percentage target has to be between ${MIN_PCT}% and ${MAX_PCT}%.`;
  return null;
}

/**
 * The most you can pay and still be inside this watch.
 *
 * For a percent target this floats with market. For a fixed target it is the
 * fixed number — which is the point of choosing it.
 * Returns null when there is no market price to work from and the target
 * needs one; a percentage of nothing is nothing, not zero.
 */
export function ceiling(t: WatchTarget, market: number | null): number | null {
  if (t.target_kind === "price") return t.target_price;
  if (market === null || t.target_pct === null) return null;
  return round2(market * (1 - t.target_pct / 100));
}

export type WatchStatus =
  /** No published price for this card+finish — we will not guess one. */
  | { kind: "no_price" }
  /** Fixed ceiling, and market has come down to or below it. */
  | { kind: "in_range"; market: number; ceiling: number; under: number }
  /** Fixed ceiling, market still above it. */
  | { kind: "above"; market: number; ceiling: number; over: number; overPct: number }
  /** Percentage target — a live pay-up-to figure, not a trigger. */
  | { kind: "pay_up_to"; market: number; ceiling: number; pct: number };

export function status(t: WatchTarget, market: number | null): WatchStatus {
  if (market === null || market <= 0) return { kind: "no_price" };

  const c = ceiling(t, market);
  if (c === null) return { kind: "no_price" };

  if (t.target_kind === "percent") {
    return { kind: "pay_up_to", market, ceiling: c, pct: t.target_pct ?? 0 };
  }

  if (market <= c) return { kind: "in_range", market, ceiling: c, under: round2(c - market) };

  const over = round2(market - c);
  return { kind: "above", market, ceiling: c, over, overPct: round2((over / c) * 100) };
}

/** Change in market since the watch was created. Null when either end is unknown. */
export function drift(
  market: number | null,
  atAdd: number | null,
): { abs: number; pct: number } | null {
  if (market === null || atAdd === null || atAdd <= 0) return null;
  const abs = round2(market - atAdd);
  return { abs, pct: round2((abs / atAdd) * 100) };
}

/**
 * Sort order. A vendor scanning this page wants the cards that are actually
 * buyable right now at the top, then the ones closest to being buyable.
 * Percentage watches sit below fixed ones because they can never "arrive".
 */
export function sortKey(s: WatchStatus): [number, number] {
  switch (s.kind) {
    case "in_range":
      return [0, -s.under];
    case "above":
      return [1, s.overPct];
    case "pay_up_to":
      return [2, 0];
    case "no_price":
      return [3, 0];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
