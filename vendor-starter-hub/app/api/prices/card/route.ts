import { NextResponse } from "next/server";
import { getCardsByIds, isCardId } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One card by id. Used by the watchlist edit form, which needs the card's
 * current finishes to offer them as options.
 *
 * Signed-in only. Not because card prices are secret — the public search
 * route serves the same data — but because this one exists solely for the
 * back office, and an unauthenticated endpoint would let anyone burn the
 * shared upstream request budget one card at a time.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isCardId(id))
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const { cards, stale, degraded } = await getCardsByIds([id]);
  const card = cards.get(id);

  if (!card) {
    return NextResponse.json(
      { ok: false, error: degraded ? "upstream" : "not_found" },
      { status: degraded ? 503 : 404 },
    );
  }

  return NextResponse.json(
    { ok: true, card, stale: stale.has(id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
