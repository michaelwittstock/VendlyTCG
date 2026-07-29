"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCardId } from "@/lib/prices";
import { validateTarget, type WatchTarget } from "@/lib/watchlist";

export type ActionState = { error?: string; ok?: boolean };

const num = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s || null;
};

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function done(): ActionState {
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/* ---------------- inventory ---------------- */

export async function saveItem(
  _prev: ActionState,
  f: FormData
): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };

  const name = str(f.get("name"));
  if (!name) return { error: "Give the item a name." };

  const row = {
    name,
    category: String(f.get("category") ?? "single"),
    set_name: str(f.get("set_name")),
    condition: str(f.get("condition")),
    quantity: Math.max(0, Math.round(num(f.get("quantity"), 1))),
    cost_basis: num(f.get("cost_basis")),
    asking_price: str(f.get("asking_price")) ? num(f.get("asking_price")) : null,
    status: String(f.get("status") ?? "in_stock"),
    notes: str(f.get("notes")),
  };

  const id = str(f.get("id"));
  const { error } = id
    ? await supabase.from("inventory_items").update(row).eq("id", id)
    : await supabase.from("inventory_items").insert(row);
  if (error) return { error: error.message };
  return done();
}

export async function deleteItem(id: string): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

/* ---------------- sales ---------------- */

export async function logSale(
  _prev: ActionState,
  f: FormData
): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };

  const itemId = str(f.get("item_id"));
  const quantity = Math.max(1, Math.round(num(f.get("quantity"), 1)));
  const salePrice = num(f.get("sale_price"));
  const fees = num(f.get("fees"));
  const channel = String(f.get("channel") ?? "show");
  const customerId = str(f.get("customer_id"));
  const showId = str(f.get("show_id"));
  const soldDate = str(f.get("sold_at"));
  const soldAt = soldDate
    ? new Date(`${soldDate}T12:00:00`).toISOString()
    : new Date().toISOString();
  const notes = str(f.get("notes"));

  if (itemId) {
    const { error } = await supabase.rpc("log_sale", {
      p_item_id: itemId,
      p_quantity: quantity,
      p_sale_price: salePrice,
      p_fees: fees,
      p_channel: channel,
      p_customer_id: customerId,
      p_show_id: showId,
      p_sold_at: soldAt,
      p_notes: notes,
    });
    if (error) return { error: error.message };
  } else {
    const itemName = str(f.get("item_name"));
    if (!itemName) return { error: "Pick an item — or type what you sold." };
    const { error } = await supabase.from("sales").insert({
      item_name: itemName,
      category: String(f.get("category") ?? "other"),
      quantity,
      sale_price: salePrice,
      cost_basis: num(f.get("cost_basis")),
      fees,
      channel,
      customer_id: customerId,
      show_id: showId,
      sold_at: soldAt,
      notes,
    });
    if (error) return { error: error.message };
  }
  return done();
}

export async function deleteSale(id: string): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("sales").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

/* ---------------- customers ---------------- */

export async function saveCustomer(
  _prev: ActionState,
  f: FormData
): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const name = str(f.get("name"));
  if (!name) return { error: "Customer needs a name." };
  const row = {
    name,
    contact: str(f.get("contact")),
    collects: str(f.get("collects")),
    notes: str(f.get("notes")),
  };
  const id = str(f.get("id"));
  const { error } = id
    ? await supabase.from("customers").update(row).eq("id", id)
    : await supabase.from("customers").insert(row);
  if (error) return { error: error.message };
  return done();
}

export async function deleteCustomer(id: string): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

/* ---------------- shows ---------------- */

export async function saveShow(
  _prev: ActionState,
  f: FormData
): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const name = str(f.get("name"));
  if (!name) return { error: "Show needs a name." };
  const row = {
    name,
    venue: str(f.get("venue")),
    show_date: str(f.get("show_date")),
    table_cost: num(f.get("table_cost")),
    notes: str(f.get("notes")),
  };
  const id = str(f.get("id"));
  const { error } = id
    ? await supabase.from("shows").update(row).eq("id", id)
    : await supabase.from("shows").insert(row);
  if (error) return { error: error.message };
  return done();
}

export async function deleteShow(id: string): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("shows").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

/* ---------------- watchlist ---------------- */

export async function saveWatch(
  _prev: ActionState,
  f: FormData
): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };

  const cardId = str(f.get("card_id"));
  const cardName = str(f.get("card_name"));
  if (!cardId || !cardName) return { error: "Pick a card from the search first." };
  // The id ends up inside an upstream query string. It arrives from a form,
  // so it is user input regardless of where the form got it.
  if (!isCardId(cardId)) return { error: "That card id does not look valid." };

  const kind = String(f.get("target_kind") ?? "percent");
  if (kind !== "price" && kind !== "percent")
    return { error: "Pick either a dollar ceiling or a percentage." };

  const target: WatchTarget = {
    target_kind: kind,
    target_price: kind === "price" ? num(f.get("target_price"), NaN) : null,
    target_pct: kind === "percent" ? num(f.get("target_pct"), NaN) : null,
  };
  const bad = validateTarget(target);
  if (bad) return { error: bad };

  const marketAtAdd = str(f.get("market_at_add"));
  const row = {
    card_id: cardId,
    card_name: cardName.slice(0, 200),
    set_name: str(f.get("set_name")),
    card_number: str(f.get("card_number")),
    rarity: str(f.get("rarity")),
    image_url: str(f.get("image_url")),
    // "" from the select means "highest-value finish", which is NULL in the DB.
    finish: str(f.get("finish")),
    ...target,
    notes: str(f.get("notes")),
    active: f.get("active") === "off" ? false : true,
  };

  const id = str(f.get("id"));
  if (id) {
    const { error } = await supabase.from("watchlist").update(row).eq("id", id);
    if (error) return { error: error.message };
    return done();
  }

  // Re-adding a card you already watch should move the target, not create a
  // second row that quietly disagrees with the first. The unique index is on
  // (user_id, card_id, coalesce(finish,'')), so upsert has to name it.
  const { error } = await supabase.from("watchlist").insert({
    ...row,
    market_at_add: marketAtAdd ? num(f.get("market_at_add")) : null,
  });
  if (error) {
    if (error.code === "23505")
      return { error: "You are already watching that card in that finish." };
    return { error: error.message };
  }
  return done();
}

export async function deleteWatch(id: string): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("watchlist").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

export async function setWatchActive(
  id: string,
  active: boolean
): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase
    .from("watchlist")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  return done();
}

/* ---------------- alerts ---------------- */

/**
 * Store a device's push subscription.
 *
 * Upsert on endpoint, not insert. A browser hands back the SAME endpoint when
 * you re-subscribe, and a person who signs out and back in on one device must
 * end up with one row that belongs to whoever is signed in now — two rows
 * would deliver one vendor's watchlist to another.
 */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string;
}): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };

  if (!sub?.endpoint || !sub.p256dh || !sub.auth) {
    return { error: "That subscription is missing its keys." };
  }
  // These arrive from the browser, so they are input even though no human
  // typed them. The DB has matching length checks as the backstop.
  if (sub.endpoint.length > 1000 || sub.p256dh.length > 200 || sub.auth.length > 100) {
    return { error: "That subscription does not look right." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.user_agent?.slice(0, 300) ?? null,
      failure_count: 0,
      last_error: null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };

  // First time in, give them settings so the defaults are visible and editable
  // rather than implicit. ignoreDuplicates: never stamp over choices they made.
  await supabase
    .from("alert_settings")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  return done();
}

export async function removePushSubscription(endpoint: string): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return done();
}

export async function saveAlertSettings(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Not signed in." };

  const minPct = num(form.get("min_pct_under"), 15);
  const minDays = Math.round(num(form.get("min_recorded_days"), 7));
  const quiet = str(form.get("quiet_until"));

  // Mirrors the DB check constraints so the form can say something useful
  // before a round trip, the same way validateTarget does for watches.
  if (minPct < 5 || minPct > 90)
    return { error: "Pick a threshold between 5% and 90%." };
  if (minDays < 3 || minDays > 30)
    return { error: "Wait for between 3 and 30 recorded days." };

  const { error } = await supabase.from("alert_settings").upsert(
    {
      user_id: user.id,
      enabled: form.get("enabled") !== null,
      min_pct_under: minPct,
      min_recorded_days: minDays,
      quiet_until: quiet,
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };
  return done();
}
