/**
 * Show mode: the data a vendor needs at a table with no signal, and the queue
 * of sales made while there was none.
 *
 * PURE + BROWSER-SAFE ON PURPOSE. Nothing here imports lib/prices (server
 * only) or Supabase. The pack arrives from /api/show-pack with prices already
 * resolved to plain numbers, so this file never needs the network and can be
 * unit tested without one.
 *
 * The rule the whole file is built around: a sale that happened in the real
 * world must never be lost, and a price must never be shown as current when
 * it is not. Everything else is negotiable.
 */

export const PACK_VERSION = 2;

/** localStorage keys. Versioned so a shape change cannot be read as the old shape. */
export const PACK_KEY = "vendly.showpack.v2";
export const QUEUE_KEY = "vendly.salequeue.v2";

/** Older than this and the UI stops presenting the pack as today's numbers. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type PackItem = {
  id: string;
  name: string;
  set_name: string | null;
  category: string;
  condition: string | null;
  quantity: number;
  cost_basis: number;
  asking_price: number | null;
};

export type PackWatch = {
  card_id: string;
  card_name: string;
  set_name: string | null;
  finish_label: string | null;
  /** Market at the moment the pack was built. Null means genuinely unpriced. */
  market: number | null;
  target_kind: "price" | "percent";
  target_price: number | null;
  target_pct: number | null;
  /** Provider's own "prices as of" date, which is not the same as when we cached them. */
  priced_at: string | null;
};

export type PackRef = { id: string; name: string; show_date?: string | null };

export type ShowPack = {
  version: number;
  /** Whose data this is. A shared browser must not show one vendor another's stock. */
  userId: string;
  /** When this device took the copy. The number every "cached Xh ago" label derives from. */
  cachedAt: string;
  items: PackItem[];
  watches: PackWatch[];
  shows: PackRef[];
  customers: PackRef[];
  /** True when at least one watch price could not be refreshed as the pack was built. */
  pricesDegraded: boolean;
};

export type Channel = "show" | "online" | "local";

export type QueuedSale = {
  /** Client-generated idempotency key. The reason a retry cannot double-log. */
  ref: string;
  createdAt: string;
  soldAt: string;
  itemId: string | null;
  itemName: string;
  category: string;
  quantity: number;
  /** Per unit, as typed. */
  salePrice: number;
  /** Per unit. Only used for quick sales — item sales snapshot cost server-side. */
  costBasis: number;
  fees: number;
  channel: Channel;
  showId: string | null;
  customerId: string | null;
  notes: string | null;
  attempts: number;
  lastError: string | null;
};

export type SyncResult =
  | { ref: string; ok: true; id: string; oversold: boolean }
  | { ref: string; ok: false; error: string; retryable: boolean };

/* ------------------------------------------------------------------ *
 * pure helpers
 * ------------------------------------------------------------------ */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Gross taken, and profit after the cost we know about. */
export function saleTotals(s: {
  quantity: number;
  salePrice: number;
  costBasis: number;
  fees: number;
}): { gross: number; profit: number } {
  const gross = round2(s.salePrice * s.quantity);
  const profit = round2((s.salePrice - s.costBasis) * s.quantity - s.fees);
  return { gross, profit };
}

export function queueSummary(queue: QueuedSale[]): {
  count: number;
  gross: number;
  failing: number;
} {
  let gross = 0;
  let failing = 0;
  for (const s of queue) {
    gross += s.salePrice * s.quantity;
    if (s.attempts > 0 && s.lastError) failing++;
  }
  return { count: queue.length, gross: round2(gross), failing };
}

/**
 * The most you can pay on a watch, offline.
 *
 * Mirrors lib/watchlist ceiling() deliberately rather than importing it: this
 * runs against a cached market price, and the caller has to be able to say
 * WHEN that price was taken. Returning a bare number from a shared helper
 * would make it too easy to render it as if it were live.
 */
export function payUpTo(w: PackWatch): number | null {
  if (w.target_kind === "price") return w.target_price;
  if (w.market === null || w.target_pct === null) return null;
  return round2(w.market * (1 - w.target_pct / 100));
}

/** Milliseconds since the pack was taken. Null if the stamp is unreadable. */
export function packAge(pack: Pick<ShowPack, "cachedAt">, now = Date.now()): number | null {
  const t = Date.parse(pack.cachedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

/** "just now" / "14 min ago" / "3 hr ago" / "2 days ago". Never a bare timestamp. */
export function describeAge(ms: number | null): string {
  if (ms === null) return "at an unknown time";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export function isStale(ms: number | null): boolean {
  return ms === null || ms > STALE_AFTER_MS;
}

/** Case- and punctuation-insensitive substring match over the fields you would
 *  actually squint at across a table: name and set. */
export function matchItem(item: PackItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${item.name} ${item.set_name ?? ""} ${item.condition ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/** In-stock first, then alphabetical. Sold-out rows stay visible — you can
 *  still sell something the count says you do not have, and pretending
 *  otherwise is how stock counts silently rot. */
export function sortItems(items: PackItem[]): PackItem[] {
  return [...items].sort((a, b) => {
    const av = a.quantity > 0 ? 0 : 1;
    const bv = b.quantity > 0 ? 0 : 1;
    if (av !== bv) return av - bv;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Apply what the server said about each queued sale.
 *
 * Rules, in order of how much they matter:
 *  1. A sale the server accepted leaves the queue. Anything else risks
 *     double-logging, which the client_ref guard makes safe but which would
 *     still leave the vendor staring at rows that already landed.
 *  2. A sale the server rejected NEVER leaves the queue on its own. It stays,
 *     with the reason attached, and only the vendor can remove it. Silently
 *     dropping a rejected sale loses real money that really changed hands.
 *  3. A sale the server did not answer about is left exactly as it was.
 */
export function mergeSyncResults(
  queue: QueuedSale[],
  results: SyncResult[]
): { queue: QueuedSale[]; synced: number; oversold: string[]; failed: QueuedSale[] } {
  const byRef = new Map(results.map((r) => [r.ref, r]));
  const next: QueuedSale[] = [];
  const failed: QueuedSale[] = [];
  const oversold: string[] = [];
  let synced = 0;

  for (const sale of queue) {
    const r = byRef.get(sale.ref);
    if (!r) {
      next.push(sale);
      continue;
    }
    if (r.ok) {
      synced++;
      if (r.oversold) oversold.push(sale.itemName);
      continue;
    }
    const marked: QueuedSale = {
      ...sale,
      attempts: sale.attempts + 1,
      lastError: r.error,
    };
    next.push(marked);
    failed.push(marked);
  }

  return { queue: next, synced, oversold, failed };
}

/** Backoff between automatic sync attempts. Capped so a long day at a show
 *  never ends with the queue waiting an hour to try again. */
export function nextAttemptDelayMs(attempts: number): number {
  const n = Math.max(0, Math.floor(attempts));
  return Math.min(60_000, 2_000 * Math.pow(2, n));
}

/**
 * Which sales to put in the next request, least-tried first.
 *
 * Order matters once the queue is longer than one batch: a handful of rows the
 * server will never accept sit at the front of the queue forever, and sending
 * the queue in order would mean they consume the batch every time and a sale
 * made ten minutes ago never gets its turn.
 */
export function syncBatch(queue: QueuedSale[], max = 100): QueuedSale[] {
  if (queue.length <= max) return queue;
  return [...queue].sort((a, b) => a.attempts - b.attempts).slice(0, max);
}

export function newRef(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Deterministic fallback for environments without WebCrypto. Uniqueness is
  // what matters here, not unguessability — the ref is only an idempotency key.
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/* ------------------------------------------------------------------ *
 * storage (browser only, and never throws)
 * ------------------------------------------------------------------ */

function store(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Private-mode Safari and blocked third-party storage both throw on access.
    return null;
  }
}

/**
 * Read the pack, but only if it belongs to the person currently signed in.
 * A browser is shared; one vendor's stock list must not appear under another's
 * account just because it was cached first.
 */
export function loadPack(userId: string): ShowPack | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(PACK_KEY);
    if (!raw) return null;
    const pack = JSON.parse(raw) as ShowPack;
    if (pack?.version !== PACK_VERSION) return null;
    if (!pack.userId || pack.userId !== userId) return null;
    if (!Array.isArray(pack.items) || !Array.isArray(pack.watches)) return null;
    return pack;
  } catch {
    return null;
  }
}

export function savePack(pack: ShowPack): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(PACK_KEY, JSON.stringify(pack));
    return true;
  } catch {
    // Quota. The queue matters more than the pack, so we drop the pack rather
    // than let a full store stop a sale being recorded.
    try {
      s.removeItem(PACK_KEY);
    } catch {}
    return false;
  }
}

export function loadQueue(): QueuedSale[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(QUEUE_KEY);
    if (!raw) return [];
    const q = JSON.parse(raw);
    if (!Array.isArray(q)) return [];
    // A ref is how the server's answer finds its row again. A blank one can
    // never be matched, so the sale would sit in the queue being retried
    // forever with nothing able to resolve it.
    return q.filter((x) => x && typeof x.ref === "string" && x.ref.length > 0);
  } catch {
    return [];
  }
}

/** Returns false when the write failed, so the caller can refuse to clear the
 *  form and tell the vendor the sale is NOT saved. */
export function saveQueue(queue: QueuedSale[]): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

export function clearPack(): void {
  const s = store();
  try {
    s?.removeItem(PACK_KEY);
  } catch {}
}

/* ------------------------------------------------------------------ *
 * the day's ledger
 *
 * Separate from the queue on purpose. The queue is "what has not reached the
 * server"; this is "what I have taken today", which a vendor needs to see even
 * after everything has synced and the queue is empty. Display only — nothing
 * here is ever the source of truth for a sale.
 * ------------------------------------------------------------------ */

export const LOG_KEY = "vendly.showlog.v2";
/** Long enough to cover a two-day show plus the drive home. */
export const LOG_KEEP_MS = 36 * 60 * 60 * 1000;

export type LogEntry = {
  ref: string;
  at: string;
  itemName: string;
  quantity: number;
  gross: number;
  profit: number;
};

export function pruneLog(log: LogEntry[], now = Date.now()): LogEntry[] {
  return log.filter((e) => {
    const t = Date.parse(e.at);
    // An unparseable stamp is kept rather than dropped: losing a row from the
    // day's total is worse than showing one row too many.
    return !Number.isFinite(t) || now - t < LOG_KEEP_MS;
  });
}

export function logTotals(log: LogEntry[]): {
  sales: number;
  units: number;
  gross: number;
  profit: number;
} {
  let units = 0;
  let gross = 0;
  let profit = 0;
  for (const e of log) {
    units += e.quantity;
    gross += e.gross;
    profit += e.profit;
  }
  return { sales: log.length, units, gross: round2(gross), profit: round2(profit) };
}

export function loadLog(): LogEntry[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(LOG_KEY);
    if (!raw) return [];
    const log = JSON.parse(raw);
    if (!Array.isArray(log)) return [];
    return log.filter((x) => x && typeof x.ref === "string");
  } catch {
    return [];
  }
}

export function saveLog(log: LogEntry[]): void {
  const s = store();
  try {
    s?.setItem(LOG_KEY, JSON.stringify(log));
  } catch {}
}
