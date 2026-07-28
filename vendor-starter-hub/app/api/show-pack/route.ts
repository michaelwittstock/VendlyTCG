import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCardsByIds, pickFinish, referencePrice } from "@/lib/prices";
import {
  PACK_VERSION,
  type PackItem,
  type PackRef,
  type PackWatch,
  type ShowPack,
} from "@/lib/showpack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Everything Show mode needs to work with no signal, in one response.
 *
 * Built server-side because lib/prices is server-only and because resolving
 * watch prices here means the device stores plain numbers with ONE timestamp
 * on them — the moment the pack was taken. A client that fetched prices
 * itself would end up with a pile of values of different ages and no honest
 * way to label them.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [itemsRes, watchRes, showsRes, custRes] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id,name,set_name,category,condition,quantity,cost_basis,asking_price")
      .order("name"),
    supabase
      .from("watchlist")
      .select("card_id,card_name,set_name,finish,target_kind,target_price,target_pct")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase.from("shows").select("id,name,show_date").order("show_date", { ascending: false }),
    supabase.from("customers").select("id,name").order("name"),
  ]);

  const rawItems = itemsRes.data ?? [];
  const rawWatches = watchRes.data ?? [];

  // One upstream call per 20 cards, behind the shared 6h price cache.
  const { cards, degraded } = await getCardsByIds(rawWatches.map((w) => w.card_id));

  const items: PackItem[] = rawItems.map((i) => ({
    id: i.id,
    name: i.name,
    set_name: i.set_name,
    category: i.category,
    condition: i.condition,
    quantity: i.quantity,
    cost_basis: num(i.cost_basis),
    asking_price: numOrNull(i.asking_price),
  }));

  const watches: PackWatch[] = rawWatches.map((w) => {
    const card = cards.get(w.card_id);
    const finish = pickFinish(card, w.finish);
    return {
      card_id: w.card_id,
      card_name: w.card_name,
      set_name: w.set_name,
      finish_label: finish?.label ?? null,
      // Null means genuinely unpriced. It is never rendered as $0.
      market: referencePrice(finish),
      target_kind: (w.target_kind === "price" ? "price" : "percent") as "price" | "percent",
      target_price: numOrNull(w.target_price),
      target_pct: numOrNull(w.target_pct),
      priced_at: card?.updatedAt ?? null,
    };
  });

  const shows: PackRef[] = (showsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    show_date: s.show_date,
  }));
  const customers: PackRef[] = (custRes.data ?? []).map((c) => ({ id: c.id, name: c.name }));

  const pack: ShowPack = {
    version: PACK_VERSION,
    userId: user.id,
    cachedAt: new Date().toISOString(),
    items,
    watches,
    shows,
    customers,
    pricesDegraded: degraded,
  };

  return NextResponse.json(
    { ok: true, pack },
    // This is one vendor's stock list. It must not sit in a shared cache, and
    // the device copy in localStorage is the only copy we want kept.
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
