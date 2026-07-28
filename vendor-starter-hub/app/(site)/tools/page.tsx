import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/email-capture";

export const metadata: Metadata = {
  title: "Free tools",
  description: "Free tools for card show vendors: profit calculator, inventory template, show-prep checklist, price labels.",
};

export default function Tools() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="chrome-text display text-5xl sm:text-6xl">Free tools</h1>
      <p className="mt-5 max-w-xl text-lg text-dim">
        Built for the table, not the boardroom. New tools ship to the list first.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Link
          href="/tools/profit-calculator"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <span className="sticker">Live now</span>
          <h2 className="display mt-4 text-2xl">Show profit calculator</h2>
          <p className="mt-3 text-sm text-dim">
            Table fee + costs + expected sales → your real profit and break-even number.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Open →
          </p>
        </Link>
        <Link
          href="/tools/inventory-template"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <span className="sticker">Live now</span>
          <h2 className="display mt-4 text-2xl">Inventory + cost-basis template</h2>
          <p className="mt-3 text-sm text-dim">
            Track buys, cost basis, and show sales. Know your actual profit per card.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Download →
          </p>
        </Link>
        <Link
          href="/tools/show-prep-checklist"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <span className="sticker">Live now</span>
          <h2 className="display mt-4 text-2xl">Show-prep checklist</h2>
          <p className="mt-3 text-sm text-dim">
            The printable list so you never forget the change float again.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Download →
          </p>
        </Link>
        <div className="rounded-lg border border-line bg-card p-6">
          <span className="sticker-muted">Coming</span>
          <h2 className="display mt-4 text-2xl">Price label generator</h2>
          <p className="mt-3 text-sm text-dim">
            Clean, readable labels from your inventory list — print and stick.
          </p>
        </div>
      </div>
      <div className="mt-10 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Get new tools first
        </p>
        <div className="mt-4">
          <EmailCapture cta="Join the list" source="tools" />
        </div>
      </div>
    </div>
  );
}
