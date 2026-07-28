import { createClient } from "@/lib/supabase/server";
import CustomersClient from "./customers-client";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: sales }] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("sales").select("customer_id,sale_price,quantity"),
  ]);
  return <CustomersClient customers={customers ?? []} sales={sales ?? []} />;
}
