import { NextResponse } from "next/server";
import { searchCards } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";

  const result = await searchCards(q);

  if (!result.ok) {
    const status = result.error === "empty_query" ? 400 : 503;
    const headers: Record<string, string> = {};
    // Tell the caller when it is worth trying again rather than making them guess.
    if (result.error === "busy") headers["Retry-After"] = "30";
    return NextResponse.json({ ok: false, error: result.error }, { status, headers });
  }

  return NextResponse.json(
    { ok: true, cards: result.cards, total: result.total, stale: result.stale },
    { headers: { "Cache-Control": "no-store" } },
  );
}
