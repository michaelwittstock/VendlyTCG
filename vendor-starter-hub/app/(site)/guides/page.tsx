import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Vendor guides for trading card sellers: sourcing, pricing, booth setup, payments, and taxes.",
};

const published = [
  {
    href: "/guides/first-vendor-table",
    title: "Your first vendor table",
    blurb:
      "The complete guide: break-even math, inventory mix, sourcing, pricing to comps, booth layout, payments, California permits and sales tax, and the four numbers to check when you get home.",
    meta: "~12 min read · Updated July 2026",
  },
];

const upcoming = [
  "What actually sells at card shows",
  "Sourcing inventory without overpaying",
  "Pricing strategy: comps, not vibes",
  "Booth setup on a budget",
  "Cash, card readers, and payment apps",
  "Sales tax basics for CA vendors",
];

export default function Guides() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="chrome-text display text-5xl sm:text-6xl">Guides</h1>
      <p className="mt-5 text-lg text-dim">
        The library is being written in the open. Start with the pillar guide — the deep dives
        land here as they ship.
      </p>

      <div className="mt-10 space-y-4">
        {published.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="group block rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1 hover:border-sticker"
          >
            <span className="sticker">Read now</span>
            <h2 className="display mt-4 text-3xl">{g.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-dim">{g.blurb}</p>
            <p className="mt-4 font-mono text-xs uppercase tracking-wider text-dim">{g.meta}</p>
            <p className="mt-3 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
              Open the guide →
            </p>
          </Link>
        ))}
      </div>

      <h2 className="display mt-14 text-2xl">In the works</h2>
      <div className="mt-5 space-y-3">
        {upcoming.map((g) => (
          <div
            key={g}
            className="flex items-center justify-between gap-4 rounded-lg border border-line bg-card p-5"
          >
            <p className="display text-xl">{g}</p>
            <span className="sticker-muted shrink-0">In the works</span>
          </div>
        ))}
      </div>
    </div>
  );
}
