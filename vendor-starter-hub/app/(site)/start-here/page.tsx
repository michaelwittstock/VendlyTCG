import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/email-capture";

export const metadata: Metadata = {
  title: "Your first vendor table",
  description:
    "The starter playbook for first-time trading card vendors: inventory, pricing, booth setup, payments, cost basis, and the legal basics.",
};

const sections: {
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
}[] = [
  {
    title: "Pick inventory that moves",
    body: "Your first table is not the place for trophy cards. Stock high-velocity singles in the $5–40 range and affordable sealed if your bankroll allows. Velocity beats prestige: ten $15 cards that sell beat one $150 card that doesn't.",
  },
  {
    title: "Price to comps, not hope",
    body: "Anchor every price to current market comps, not what you paid or what you wish it was worth. Label everything clearly — unlabeled cards don't sell. Bundle deals like 4-for-$10 boxes move volume and start conversations.",
  },
  {
    title: "Booth setup on a budget",
    body: "A clean cloth, a couple of risers, clear price stickers, and good light beat an expensive setup that's cluttered. Add a glass case once you carry hits worth protecting. Make your best stuff visible from six feet away.",
  },
  {
    title: "Cash and payments",
    body: "Bring a change float (small bills, more than you think). Take cards with a reader like Square — you will lose sales without one. Post your payment options so nobody has to ask.",
  },
  {
    title: "Track your cost basis",
    body: "Profit is what's left after what you paid — not what you grossed. Log every buy and every sale. Our free inventory + cost-basis template does it for you — cost basis, fees, and per-show profit in one spreadsheet.",
    href: "/tools/inventory-template",
    hrefLabel: "Get the template",
  },
  {
    title: "The legal bit (California)",
    body: "Selling tangible goods at shows in CA generally requires a seller's permit from the CDTFA, and you're expected to collect sales tax. Temporary permits exist for occasional sellers. This isn't legal advice — check the CDTFA site before your first show.",
  },
  {
    title: "Show-day checklist",
    body: "Inventory + display gear, price stickers and pens, change float, card reader, phone battery pack, sleeves and toploaders for sales, water, and a plan for your first hour — restocks and repricing happen fast.",
  },
];

export default function StartHere() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <span className="sticker">The playbook</span>
      <h1 className="chrome-text display mt-5 text-5xl sm:text-6xl">Your first vendor table</h1>
      <p className="mt-5 text-lg text-dim">
        Everything you actually need to know before you set up — condensed. Want the long version?
        Read the full{" "}
        <Link
          href="/guides/first-vendor-table"
          className="text-sticker underline underline-offset-4"
        >
          first vendor table guide
        </Link>
        .
      </p>
      <div className="mt-10 space-y-8">
        {sections.map((s) => (
          <section key={s.title} className="rounded-lg border border-line bg-card p-6">
            <h2 className="display text-2xl">{s.title}</h2>
            <p className="mt-3 text-dim">{s.body}</p>
            {s.href && (
              <Link
                href={s.href}
                className="mt-4 inline-block font-mono text-xs font-bold uppercase tracking-wider text-sticker underline underline-offset-4"
              >
                {s.hrefLabel} →
              </Link>
            )}
          </section>
        ))}
      </div>
      <div className="mt-12 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Get the show-prep checklist
        </p>
        <p className="mt-2 text-sm text-dim">
          The inventory template is already free — the printable show-prep checklist goes out to
          the list first.
        </p>
        <div className="mt-4">
          <EmailCapture cta="Send it to me" />
        </div>
      </div>
    </div>
  );
}
