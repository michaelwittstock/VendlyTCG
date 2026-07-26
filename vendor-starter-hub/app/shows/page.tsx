import type { Metadata } from "next";
import EmailCapture from "@/components/email-capture";

export const metadata: Metadata = {
  title: "SoCal show calendar",
  description: "Card shows across the Inland Empire and Southern California: dates, venues, table costs, and admission.",
};

export default function Shows() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <span className="sticker-muted">In research</span>
      <h1 className="chrome-text display mt-5 text-5xl sm:text-6xl">SoCal show calendar</h1>
      <p className="mt-5 text-lg text-dim">
        One calendar for Inland Empire and greater SoCal card shows — dates, venues, table costs,
        and admission. We verify listings with organizers instead of scraping stale event pages.
      </p>
      <div className="mt-10 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Each listing will include
        </p>
        <ul className="mt-4 space-y-2 text-dim">
          <li>Date, venue, and city</li>
          <li>Table cost and how to book one</li>
          <li>Admission price and hours</li>
          <li>Vendor notes: load-in, foot traffic, what sells there</li>
        </ul>
      </div>
      <div className="mt-8 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Get the calendar when it drops
        </p>
        <div className="mt-4">
          <EmailCapture cta="Notify me" />
        </div>
      </div>
    </div>
  );
}
