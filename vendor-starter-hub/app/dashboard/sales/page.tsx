import { createClient } from "@/lib/supabase/server";
import SalesClient from "./sales-client";

export const metadata = { title: "Sales" };

export default async function SalesPage() {
  const supabase = await createClient();
  const [{ data: sales }, { data: items }, { data: customers }, { data: shows }] =
    await Promise.all([
      supabase.from("sales").select("*").order("sold_at", { ascending: false }),
      supabase
        .from("inventory_items")
        .select("id,name,set_name,quantity,cost_basis,asking_price,category")
        .gt("quantity", 0)
        .order("name"),
      supabase.from("customers").select("id,name").order("name"),
      supabase
        .from("shows")
        .select("id,name,show_date")
        .order("show_date", { ascending: false }),
    ]);
  return (
    <SalesClient
      sales={sales ?? []}
      items={items ?? []}
      customers={customers ?? []}
      shows={shows ?? []}
    />
  );
}
