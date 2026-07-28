/**
 * Validation for sales arriving from a device's offline queue.
 *
 * Split out of the route so it can be tested without a server or a session.
 * This is the security boundary: these rows sat in localStorage on a phone, so
 * they are user input no matter how trustworthy the form that wrote them
 * looked. Nothing here trusts a single field.
 */

/** How many queued sales one request may carry. A day at a show is tens, not
 *  thousands; a bigger body is a bug or an attack, not a busy table. */
export const MAX_BATCH = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = new Set(["show", "online", "local"]);
const CATEGORIES = new Set(["single", "sealed", "slab", "supplies", "other"]);
const MAX_MONEY = 1_000_000;
const MAX_QTY = 10_000;

export type ParsedSale = {
  p_client_ref: string;
  p_item_id: string | null;
  p_item_name: string | null;
  p_category: string;
  p_quantity: number;
  p_sale_price: number;
  p_cost_basis: number;
  p_fees: number;
  p_channel: string;
  p_customer_id: string | null;
  p_show_id: string | null;
  p_sold_at: string;
  p_notes: string | null;
};

export type ParseOutcome =
  | { ok: true; row: ParsedSale }
  | { ok: false; error: string };

const money = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) return null;
  return Math.round(n * 100) / 100;
};

/** null = absent (fine). undefined = present but not a uuid (reject). */
const uuidOrNull = (v: unknown): string | null | undefined => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  return UUID_RE.test(s) ? s : undefined;
};

/**
 * Validate one queued sale. A failure is reported against its ref rather than
 * failing the whole batch — one bad row must not strand a day of good ones.
 */
export function parseQueuedSale(raw: unknown): ParseOutcome {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Not a sale." };
  const s = raw as Record<string, unknown>;

  const ref = String(s.ref ?? "");
  if (!UUID_RE.test(ref)) return { ok: false, error: "Bad sale reference." };

  const itemId = uuidOrNull(s.itemId);
  if (itemId === undefined) return { ok: false, error: "Bad item reference." };
  const customerId = uuidOrNull(s.customerId);
  if (customerId === undefined) return { ok: false, error: "Bad customer reference." };
  const showId = uuidOrNull(s.showId);
  if (showId === undefined) return { ok: false, error: "Bad show reference." };

  const name = String(s.itemName ?? "").trim().slice(0, 200);
  if (!itemId && !name) return { ok: false, error: "No item and no name." };

  const qty = Math.round(Number(s.quantity));
  if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY)
    return { ok: false, error: `Quantity must be between 1 and ${MAX_QTY.toLocaleString()}.` };

  const price = money(s.salePrice);
  if (price === null) return { ok: false, error: "Sale price is not a usable number." };
  const cost = money(s.costBasis) ?? 0;
  const fees = money(s.fees) ?? 0;

  const channel = String(s.channel ?? "show");
  if (!CHANNELS.has(channel)) return { ok: false, error: "Unknown channel." };

  const category = String(s.category ?? "other");

  const soldAtRaw = String(s.soldAt ?? "");
  const soldAt = Number.isFinite(Date.parse(soldAtRaw)) ? soldAtRaw : new Date().toISOString();

  const notes = s.notes === null || s.notes === undefined ? null : String(s.notes).slice(0, 500);

  return {
    ok: true,
    row: {
      p_client_ref: ref,
      p_item_id: itemId,
      // An inventory-linked sale takes its name and category from the item
      // server-side, so a device cannot rename or recategorise your stock.
      p_item_name: itemId ? null : name,
      p_category: CATEGORIES.has(category) ? category : "other",
      p_quantity: qty,
      p_sale_price: price,
      p_cost_basis: cost,
      p_fees: fees,
      p_channel: channel,
      p_customer_id: customerId,
      p_show_id: showId,
      p_sold_at: soldAt,
      p_notes: notes,
    },
  };
}

/**
 * Whether trying again could plausibly work.
 *
 * Getting this wrong in the "retryable" direction spins forever; getting it
 * wrong the other way tells a vendor a recoverable hiccup is permanent. The
 * default is retryable, because an unrecognised failure is more likely a
 * network or server blip than a permanently malformed sale.
 */
export function isRetryable(code: string | undefined, message: string): boolean {
  if (code === "PGRST301" || code === "42501") return false; // auth / RLS
  if (code === "23514" || code === "23503") return false; // check / FK violation
  if (/item not found/i.test(message)) return false;
  if (/client_ref is required|quantity must be/i.test(message)) return false;
  return true;
}
