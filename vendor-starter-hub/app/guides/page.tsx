import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guides",
  description: "Vendor guides for trading card sellers: sourcing, pricing, booth setup, payments, and taxes.",
};

const guides = [
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
        The library is being written in the open. Start with the playbook — the deep dives land
        here as they ship.
      </p>
      <Link
        href="/start-here"
        className="mt-6 inline-block rounded bg-sticker px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5"
      >
        Read the playbook
      </Link>
      <div className="mt-10 space-y-3">
        {guides.map((g) => (
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
