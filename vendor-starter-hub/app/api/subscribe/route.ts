import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pages that embed <EmailCapture />. Anything else is recorded as "unknown"
// rather than trusted, so the column stays queryable.
const KNOWN_SOURCES = new Set([
  "home",
  "start-here",
  "shows",
  "tools",
  "inventory-template",
  "show-prep-checklist",
  "first-vendor-table",
]);

export async function POST(request: Request) {
  let email = "";
  let source = "unknown";

  try {
    const body = await request.json();
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (typeof body.source === "string" && KNOWN_SOURCES.has(body.source)) {
      source = body.source;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If storage is not configured we must NOT report success — the whole point
  // of this route is that the visitor is told the truth about what happened.
  if (!url || !key) {
    console.error("[waitlist] Supabase env vars missing — signup dropped:", email);
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("waitlist").insert({ email, source });

  if (error) {
    // 23505 = unique violation on lower(email). Already subscribed is a success
    // from the visitor's point of view, so keep it idempotent.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[waitlist] insert failed:", error.code, error.message);
    return NextResponse.json({ ok: false, error: "store_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
