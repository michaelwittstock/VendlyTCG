import { createClient } from "@/lib/supabase/server";
import ShowsClient from "./shows-client";

export const metadata = { title: "Shows" };

export default async function ShowsPage() {
  const supabase = await createClient();
  const [{ data: shows }, { data: sales }] = await Promise.all([
    supabase
      .from("shows")
      .select("*")
      .order("show_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("sales")
      .select("show_id,sale_price,cost_basis,fees,quantity"),
  ]);
  return <ShowsClient shows={shows ?? []} sales={sales ?? []} />;
}
