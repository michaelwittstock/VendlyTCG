"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
