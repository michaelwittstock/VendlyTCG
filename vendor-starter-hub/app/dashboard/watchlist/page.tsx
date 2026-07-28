import { createClient } from "@/lib/supabase/server";
import { getCardsByIds, pickFinish, referencePrice } from "@/lib/prices";
import { status, drift } from "@/lib/watchlist";
import WatchlistClient, { type WatchRow } from "./watchlist-client";

export const metadata = { title: "Watchlist" };
// Prices are looked up per request (behind a 6h cache in lib/prices), so this
// page cannot be statically rendered.
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("watchlist")
    .select("*")
    .order("created_at", { ascending: false });

  const watches = data ?? [];

  // One upstream call per 20 cards, shared cache — never one call per row.
  const { cards, stale, unresolved, degraded } = await getCardsByIds(
    watches.filter((w) => w.active).map((w) => w.card_id),
  );

  const rows: WatchRow[] = watches.map((w) => {
    const card = cards.get(w.card_id);
    const finish = w.active ? pickFinish(card, w.finish) : null;
    const market = referencePrice(finish);
    const target = {
      target_kind: w.target_kind as "price" | "percent",
      target_price: w.target_price === null ? null : Number(w.target_price),
      target_pct: w.target_pct === null ? null : Number(w.target_pct),
    };
    const atAdd = w.market_at_add === null ? null : Number(w.market_at_add);

    return {
      id: w.id,
      card_id: w.card_id,
      card_name: w.card_name,
      set_name: w.set_name,
      card_number: w.card_number,
      rarity: w.rarity,
      // Fresher art than whatever was saved, when the lookup succeeded.
      image_url: card?.image ?? w.image_url,
      finish: w.finish,
      notes: w.notes,
      active: w.active,
      ...target,
      market_at_add: atAdd,

      finishLabel: finish?.label ?? null,
      // A watch pinned to a finish the card no longer publishes must say so,
      // not silently fall back to a different printing's money.
      finishMissing: Boolean(w.active && card && w.finish !== null && finish === null),
      // "we could not check" is a different sentence from "this card does not
      // exist", and only one of them means the watch is broken.
      unresolved: w.active && !card ? (unresolved.get(w.card_id) ?? "unavailable") : null,
      market,
      stale: stale.has(w.card_id),
      status: status(target, market),
      drift: drift(market, atAdd),
      tcgUrl: card?.url ?? null,
      pricedAt: card?.updatedAt ?? null,
    };
  });

  return <WatchlistClient rows={rows} degraded={degraded} />;
}
