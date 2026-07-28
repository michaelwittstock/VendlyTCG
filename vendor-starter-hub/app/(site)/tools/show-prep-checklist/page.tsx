import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/email-capture";

const FILE = "/downloads/vendly-tcg-show-prep-checklist.pdf";

export const metadata: Metadata = {
  title: "Free show prep checklist",
  description:
    "A printable two-page checklist for card show vendors: what to sort a week out, what to pack, the show-day timeline, and the four numbers to write down before you drive home.",
  openGraph: {
    title: "Free show prep checklist | Vendly TCG",
    description:
      "Printable two-page vendor checklist — pre-show, pack list, show day, and the numbers after.",
    type: "article",
  },
};

const lists: { heading: string; items: string[] }[] = [
  {
    heading: "One week out",
    items: [
      "Confirm the table: load-in time, what the fee includes, whether a chair comes with it",
      "Look up the venue's exact sales tax rate — it follows the venue address, not your home address",
      "Seller's permit sorted. A temporary permit is free from the CDTFA and usually issues immediately",
      "Write down your permit number — the organizer must collect it before renting you the space",
      "Set your break-even number: (table fee + travel + food) ÷ your gross margin",
      "Pull and price your inventory. Anything unpriced does not sell",
    ],
  },
  {
    heading: "Night before",
    items: [
      "Build the change float: $150–200, weighted heavily toward $1s and $5s",
      "Charge everything — phone, battery pack, card reader, lights",
      "Price stickers on every single item, no exceptions",
      "Load the car in reverse order: what you set up first goes in last",
      "Decide your last-hour discount policy now, in writing, while you are calm",
      "Print the checklist and bring your inventory tracker",
    ],
  },
  {
    heading: "Show day",
    items: [
      "Load-in: arrive at the vendor door time, not the buyer door time",
      "Before doors: know your wholesale number on everything — the first trades are vendor-to-vendor",
      "First two hours: peak traffic. Stay standing, stay off your phone, let people dig",
      "Midday: restock the front edge. A picked-over browse box stops earning",
      "Last hour: deals in both directions. Stick to the policy you wrote down last night",
      "All day: log every sale as it happens. Memory at 4pm is not a record-keeping system",
    ],
  },
  {
    heading: "Before you unpack the car",
    items: [
      "Gross sales — everything that came in, cash and card",
      "Cost of what sold — your cost basis, not the ask price",
      "Total show costs — table fee, travel, food, payment fees",
      "Net profit — and whether this room earns a repeat booking",
    ],
  },
];

export default function ShowPrepChecklist() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <span className="sticker">Free tool</span>
      <h1 className="chrome-text display mt-5 text-5xl sm:text-6xl">Show prep checklist</h1>
      <p className="mt-5 max-w-2xl text-lg text-dim">
        Two pages, printable, designed to live in the lid of your bin. Everything that has to
        happen before load-in, what to pack, how the day runs, and the four numbers to write down
        before you drive home.
      </p>

      <div className="mt-8 rounded-lg border border-line bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider">
              PDF · 2 pages · US Letter
            </p>
            <p className="mt-2 text-sm text-dim">
              Includes a break-even worksheet you fill in before you go. No signup.
            </p>
          </div>
          <a
            href={FILE}
            download
            className="whitespace-nowrap rounded bg-sticker px-6 py-3 text-center font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5"
          >
            Download PDF
          </a>
        </div>
      </div>

      <h2 className="display mt-14 text-3xl">What&apos;s on it</h2>
      <div className="mt-6 space-y-6">
        {lists.map((list) => (
          <section key={list.heading} className="rounded-lg border border-line bg-card p-6">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-sticker">
              {list.heading}
            </h3>
            <ul className="mt-4 space-y-2">
              {list.items.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-dim">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-3 w-3 shrink-0 rounded-sm border border-line"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-dim">
        The PDF also carries the full pack list — display, money, card handling, and what you need
        for yourself — split into two columns so it fits on one page.
      </p>

      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        <Link
          href="/tools/inventory-template"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-wider">Bring this too</p>
          <h3 className="display mt-3 text-2xl">Inventory + cost-basis template</h3>
          <p className="mt-2 text-sm text-dim">
            The sheet you log the day into — cost basis, fees, and per-show profit.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Download →
          </p>
        </Link>
        <Link
          href="/tools/profit-calculator"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-wider">Before you book</p>
          <h3 className="display mt-3 text-2xl">Show profit calculator</h3>
          <p className="mt-2 text-sm text-dim">
            Run the break-even number properly instead of guessing at it.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Open →
          </p>
        </Link>
      </div>

      <div className="mt-10 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Get the next tool first
        </p>
        <div className="mt-4">
          <EmailCapture cta="Join the list" />
        </div>
      </div>

      <p className="mt-10 text-xs text-dim">
        Permit and sales tax points are a plain-language summary, not legal or tax advice. Verify
        with the CDTFA before your first show — see the{" "}
        <Link href="/guides/first-vendor-table" className="text-sticker underline underline-offset-4">
          full guide
        </Link>{" "}
        for detail.
      </p>
    </div>
  );
}
