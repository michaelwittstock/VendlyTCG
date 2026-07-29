import { createClient } from "@/lib/supabase/server";
import { getCardsByIds, pickFinish, referencePrice } from "@/lib/prices";
import { status, drift } from "@/lib/watchlist";
import {
  trend,
  groupHistory,
  historyKey,
  WINDOW_DAYS,
} from "@/lib/price-history";
import WatchlistClient, { type WatchRow } from "./watchlist-client";
import AlertsPanel, { type AlertSettings } from "./alerts-panel";

export const metadata = { title: "Watchlist" };
// Prices are looked up per request (behind a 6h cache in lib/prices), so this
// page cannot be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The snapshot job files each day under its Pacific date. The window has to be
 * measured the same way or the oldest day would drop in and out of range
 * depending on what time of day the page was opened.
 */
function pacificDay(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default async function WatchlistPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("watchlist")
    .select("*")
    .order("created_at", { ascending: false });

  const watches = data ?? [];
  const activeIds = watches.filter((w) => w.active).map((w) => w.card_id);

  // One upstream call per 20 cards, shared cache — never one call per row.
  const [{ cards, stale, unresolved, degraded }, historyRes, lastRunRes] =
    await Promise.all([
      getCardsByIds(activeIds),

      // Recorded history for the cards on this page only. RLS limits this to
      // cards the signed-in user watches, so the filter is belt-and-braces
      // rather than the security boundary.
      activeIds.length > 0
        ? supabase
            .from("price_history")
            .select("card_id, finish, day, market, low")
            .in("card_id", activeIds)
            .gte("day", pacificDay(-WINDOW_DAYS))
            .order("day", { ascending: true })
        : Promise.resolve({ data: [] as never[] }),

      // When the record was last brought up to date. The page says this out
      // loud rather than letting a stalled job look like a flat market.
      supabase.rpc("price_history_last_run").maybeSingle(),
    ]);

  // Alerts. All three are RLS-scoped to the signed-in user, so no filter is
  // needed here and adding one would only imply the policy is not the boundary.
  const [settingsRes, subsRes, alertCountRes] = await Promise.all([
    supabase
      .from("alert_settings")
      .select("enabled, min_pct_under, min_recorded_days, quiet_until")
      .maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .gte("day", pacificDay(-30)),
  ]);

  // A user who has never opened the settings has no row. Falling back to the
  // table's own defaults keeps the form honest about what will actually happen
  // rather than showing empty fields that imply nothing is configured.
  const alertSettings: AlertSettings = settingsRes.data
    ? {
        enabled: settingsRes.data.enabled,
        min_pct_under: Number(settingsRes.data.min_pct_under),
        min_recorded_days: settingsRes.data.min_recorded_days,
        quiet_until: settingsRes.data.quiet_until,
      }
    : { enabled: true, min_pct_under: 15, min_recorded_days: 7, quiet_until: null };

  const history = groupHistory(historyRes.data ?? []);

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

    // Keyed on the finish this watch is actually judged on, so a watch pinned
    // to reverse holo can never be shown the holo card's trend line.
    const points = finish ? (history.get(historyKey(w.card_id, finish.label)) ?? []) : [];

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
      trend: trend(points, market),
      tcgUrl: card?.url ?? null,
      pricedAt: card?.updatedAt ?? null,
    };
  });

  const lastRun = (lastRunRes.data ?? null) as
    | { finished_at: string; status: string; rows_written: number }
    | null;

  return (
    <>
      <WatchlistClient rows={rows} degraded={degraded} lastRun={lastRun} />
      <AlertsPanel
        settings={alertSettings}
        subscribed={(subsRes.count ?? 0) > 0}
        recentCount={alertCountRes.count ?? 0}
      />
    </>
  );
}
