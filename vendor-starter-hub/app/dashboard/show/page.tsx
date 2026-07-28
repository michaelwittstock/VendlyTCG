import { createClient } from "@/lib/supabase/server";
import ShowClient from "./show-client";

export const metadata = {
  title: "Show mode",
  description: "Sell, price and log with no signal.",
};

/**
 * Deliberately renders NO data.
 *
 * The service worker caches this document so it opens at a venue with no
 * signal, and a cached document containing yesterday's stock levels would be a
 * lie that survives on the device for weeks. Everything on the page comes from
 * the copy in localStorage, which carries the timestamp the UI shows.
 *
 * The only thing that crosses is the user id — so a shared browser cannot show
 * one vendor the stock list another vendor cached first.
 */
export const dynamic = "force-dynamic";

export default async function ShowModePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <ShowClient userId={user?.id ?? ""} />;
}
