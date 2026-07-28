import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/email-capture";

const FILE = "/downloads/vendly-tcg-inventory-tracker.xlsx";

export const metadata: Metadata = {
  title: "Free inventory + cost-basis template",
  description:
    "A free Excel inventory and sales tracker for trading card vendors. Log cost basis, sales, fees, and per-show P&L — and see what you actually made.",
  openGraph: {
    title: "Free inventory + cost-basis template | Vendly TCG",
    description:
      "Track buys, cost basis, sales, fees, and per-show profit in one spreadsheet. Free, no signup required.",
    type: "article",
  },
};

const tabs = [
  {
    name: "Inventory",
    body: "Every item you own, with the cost you actually paid. Total cost, estimated profit, and margin calculate themselves. Dropdowns for category, condition, and status.",
  },
  {
    name: "Sales Log",
    body: "Type the Item ID and the sheet pulls the name and your cost basis across automatically, then works out profit after fees and shipping. You never retype a cost.",
  },
  {
    name: "Show P&L",
    body: "One row per show. Enter the table fee and travel; gross sales and COGS get pulled from your Sales Log. Tells you whether that table actually paid for itself.",
  },
  {
    name: "Dashboard",
    body: "Inventory at cost and at ask, gross, COGS, fees, net profit, blended margin, and a profit breakdown by channel. All read-only, all automatic.",
  },
];

const math: [string, string][] = [
  ["Total Cost", "Qty × Unit Cost"],
  ["Est. Margin %", "(Ask − Unit Cost) ÷ Ask — margin on the sale price, not markup on cost"],
  ["Net Proceeds", "Gross − Fees − Shipping"],
  ["Profit", "Net Proceeds − COGS"],
  ["Show Net Profit", "Gross − COGS − Fees − Total Show Costs"],
  ["Break-even Gross", "What a show has to gross just to cover its own costs"],
];

const steps = [
  "Delete the yellow example rows. They are there to show you the expected format.",
  "Give every item a unique Item ID. Any format works — the Sales Log matches on it, so just stay consistent.",
  "Fill Inventory as you buy, Sales Log as you sell. The Dashboard and Show P&L take care of themselves.",
];

export default function InventoryTemplate() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <span className="sticker">Free tool</span>
      <h1 className="chrome-text display mt-5 text-5xl sm:text-6xl">
        Inventory + cost-basis template
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-dim">
        Profit is what&apos;s left after what you paid — not what you grossed. This is the
        spreadsheet that keeps track of the difference: what you bought, what it cost, what it
        sold for, and what each show actually put in your pocket.
      </p>

      <div className="mt-8 rounded-lg border border-line bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider">
              Excel / .xlsx · works in Google Sheets
            </p>
            <p className="mt-2 text-sm text-dim">
              250 inventory rows, 500 sales rows, 50 shows. No signup, no email wall.
            </p>
          </div>
          <a
            href={FILE}
            download
            className="whitespace-nowrap rounded bg-sticker px-6 py-3 text-center font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5"
          >
            Download free
          </a>
        </div>
      </div>

      <h2 className="display mt-14 text-3xl">What&apos;s inside</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {tabs.map((t) => (
          <div key={t.name} className="rounded-lg border border-line bg-card p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-sticker">
              {t.name}
            </p>
            <p className="mt-3 text-sm text-dim">{t.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-dim">
        Plus a <span className="text-ink">Start Here</span> tab that explains every column, and a{" "}
        <span className="text-ink">Lists</span> tab where you edit the dropdowns to match how you
        actually sell.
      </p>

      <h2 className="display mt-14 text-3xl">How to use it</h2>
      <ol className="mt-6 space-y-4">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-4 rounded-lg border border-line bg-card p-5">
            <span className="num shrink-0 font-mono text-2xl font-bold text-sticker">
              {i + 1}
            </span>
            <span className="text-dim">{step}</span>
          </li>
        ))}
      </ol>

      <h2 className="display mt-14 text-3xl">The math it does for you</h2>
      <div className="mt-6 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <tbody>
            {math.map(([label, formula], i) => (
              <tr key={label} className={i % 2 ? "bg-card" : ""}>
                <th
                  scope="row"
                  className="w-52 border-b border-line px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider"
                >
                  {label}
                </th>
                <td className="border-b border-line px-5 py-3 text-dim">{formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-dim">
        Margins turn red under 15% and green at 35% or better — a starting rule of thumb for show
        pricing, not a rule. Change the thresholds whenever you like.
      </p>

      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        <Link
          href="/tools/profit-calculator"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-wider">Pairs with</p>
          <h3 className="display mt-3 text-2xl">Show profit calculator</h3>
          <p className="mt-2 text-sm text-dim">
            Model a table before you book it, then track the real numbers here.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Open →
          </p>
        </Link>
        <Link
          href="/guides/first-vendor-table"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-wider">Read next</p>
          <h3 className="display mt-3 text-2xl">Your first vendor table</h3>
          <p className="mt-2 text-sm text-dim">
            The full playbook — break-even math, pricing, permits, and record-keeping.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Read →
          </p>
        </Link>
      </div>

      <div className="mt-10 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Get the next tool first
        </p>
        <p className="mt-2 text-sm text-dim">
          Show-prep checklist and price label generator are next out.
        </p>
        <div className="mt-4">
          <EmailCapture cta="Join the list" source="inventory-template" />
        </div>
      </div>

      <p className="mt-10 text-xs text-dim">
        This tracker is a record-keeping tool, not tax advice. Cost basis and sales records are
        what your accountant will ask for.
      </p>
    </div>
  );
}
