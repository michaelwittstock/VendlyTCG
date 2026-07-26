import { NextResponse } from "next/server";

// TODO (Roadmap: "Set up email capture + app waitlist"):
// wire this to a real provider (Kit / Buttondown / Resend audience).
// Until then, signups are acknowledged but NOT stored.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }
    console.log("[waitlist]", email);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
