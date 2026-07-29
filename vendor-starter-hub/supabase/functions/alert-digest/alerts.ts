/**
 * When an alert is worth sending, and what it is allowed to say.
 *
 * THE FAILURE MODE THIS FILE EXISTS TO PREVENT. It is not "missed a deal". It
 * is "buzzed me for nothing on a Tuesday" — because that gets notification
 * permission revoked, and a revoked permission is close to unrecoverable. iOS
 * in particular will not re-prompt; the person has to go into Settings and
 * turn it back on, which nobody does. So every rule below errs toward silence.
 *
 * WHAT AN ALERT MAY CLAIM. That a card's market price is below its own recent
 * average. That is all. It has not seen a listing, an auction or a seller —
 * that needs the eBay Browse API, which is a separate roadmap row and still
 * blocked. Copy in this file is written to be true without it.
 */

export type Candidate = {
  watch_id: string;
  card_id: string;
  card_name: string;
  finish: string;
  market: number;
  average: number;
  pct_under: number;
  recorded_days: number;
  target_kind: "price" | "percent";
  target_price: number | null;
  target_pct: number | null;
  last_alert_day: string | null;
  last_alert_pct: number | null;
};

/**
 * A card that is 20% under its average today is usually still 20% under
 * tomorrow. Without a cooldown that is a buzz a day for the same non-news.
 */
export const COOLDOWN_DAYS = 7;

/**
 * The exception to the cooldown. If the card has fallen materially FURTHER
 * since the last alert, that is genuinely new information and worth breaking
 * silence for. Five points is roughly the smallest move a vendor would change
 * a decision over.
 */
export const DEEPER_BY_PCT = 5;

/** Beyond this the notification is a wall of text nobody reads on a lock screen. */
export const MAX_DIGEST_LINES = 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type RaiseDecision =
  | { raise: true; reason: "first" | "deeper" | "cooldown_expired" }
  | { raise: false; reason: "in_cooldown" };

/**
 * Should this candidate become an alert today?
 *
 * The SQL has already checked the thresholds that depend on the person's
 * settings (how far under, how many recorded days). This is only the
 * "have we already said this recently" question, which is deliberately here
 * rather than in SQL so it can be tested without a database.
 */
export function shouldRaise(c: Candidate, today: string): RaiseDecision {
  if (!c.last_alert_day) return { raise: true, reason: "first" };

  const since = daysBetween(c.last_alert_day, today);
  if (since >= COOLDOWN_DAYS) return { raise: true, reason: "cooldown_expired" };

  const prev = c.last_alert_pct;
  if (prev !== null && c.pct_under >= prev + DEEPER_BY_PCT) {
    return { raise: true, reason: "deeper" };
  }

  return { raise: false, reason: "in_cooldown" };
}

/**
 * The watch's own pay-up-to figure, recomputed against today's market.
 *
 * Mirrors ceiling() in lib/watchlist.ts rather than importing it, because the
 * shape here comes from SQL and the shape there comes from a form. Kept small
 * on purpose; if it grows, share it.
 */
export function ceilingFor(c: Candidate): number | null {
  if (c.target_kind === "price") return c.target_price;
  if (c.target_pct === null) return null;
  return round2(c.market * (1 - c.target_pct / 100));
}

/** Is today's market inside what this person said they would pay? */
export function insideCeiling(c: Candidate): boolean {
  const ceil = ceilingFor(c);
  return ceil !== null && c.market <= ceil;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One line per card. Says the comparison out loud — "under its 30-day
 * average" — rather than the shorter, punchier and false "under market".
 */
export function alertLine(c: Candidate): string {
  const base = `${c.card_name} (${c.finish}) ${money(c.market)}, ${Math.round(
    c.pct_under,
  )}% under its ${c.recorded_days}-day average`;
  return insideCeiling(c) ? `${base} — inside your ceiling` : base;
}

export type Digest = { title: string; body: string; url: string };

/**
 * The notification itself.
 *
 * One per person per day, never one per card: a vendor watching forty cards
 * would get forty buzzes on a volatile day and turn them off that afternoon.
 * If there is nothing to say, this returns null and nothing is sent — a daily
 * "no deals today" is how you train someone to ignore the app.
 */
export function digest(cards: Candidate[]): Digest | null {
  if (cards.length === 0) return null;

  const sorted = [...cards].sort((a, b) => b.pct_under - a.pct_under);
  const shown = sorted.slice(0, MAX_DIGEST_LINES);
  const rest = sorted.length - shown.length;

  const title =
    sorted.length === 1
      ? "1 card is down against its own history"
      : `${sorted.length} cards are down against their own history`;

  const lines = shown.map(alertLine);
  if (rest > 0) lines.push(`and ${rest} more on your watchlist`);

  return { title, body: lines.join("\n"), url: "/dashboard/watchlist" };
}
