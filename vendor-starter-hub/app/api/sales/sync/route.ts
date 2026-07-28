import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SyncResult } from "@/lib/showpack";
import { MAX_BATCH, isRetryable, parseQueuedSale } from "@/lib/sale-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drain a device's offline sale queue.
 *
 * Every row is re-validated here (see lib/sale-sync) and then handed to
 * log_sale_queued, which is idempotent on client_ref — so a retry after a
 * request died mid-flight cannot double-log a sale.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const sales = (body as { sales?: unknown })?.sales;
  if (!Array.isArray(sales))
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  if (sales.length > MAX_BATCH)
    return NextResponse.json({ ok: false, error: "too_many" }, { status: 413 });

  const results: SyncResult[] = [];

  // Sequential on purpose. These mutate stock levels row by row and the
  // batches are small; parallelising would buy milliseconds and risk
  // interleaving two decrements of the same item.
  for (const raw of sales) {
    const parsed = parseQueuedSale(raw);
    if (!parsed.ok) {
      const ref = String((raw as { ref?: unknown })?.ref ?? "");
      // No ref means nothing on the device to reconcile the answer against,
      // so there is nothing useful to say about it.
      if (ref) results.push({ ref, ok: false, error: parsed.error, retryable: false });
      continue;
    }

    const { data, error } = await supabase.rpc("log_sale_queued", parsed.row);

    if (error) {
      results.push({
        ref: parsed.row.p_client_ref,
        ok: false,
        error: error.message || "The server rejected this sale.",
        retryable: isRetryable(error.code, error.message ?? ""),
      });
      continue;
    }

    const row = Array.isArray(data) ? data[0] : data;
    results.push({
      ref: parsed.row.p_client_ref,
      ok: true,
      id: String(row?.sale_id ?? ""),
      // A duplicate is a success: the sale is already recorded, and the device
      // should stop holding it. Only a genuine oversell is worth reporting.
      oversold: Boolean(row?.oversold),
    });
  }

  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
