import { createClient } from "@/lib/supabase/server";
import InventoryClient from "./inventory-client";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });
  return <InventoryClient items={data ?? []} />;
}
