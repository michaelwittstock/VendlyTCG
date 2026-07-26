import Link from "next/link";
import EmailCapture from "@/components/email-capture";

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <span className="sticker">SoCal · New vendors</span>
        <h1 className="chrome-text display mt-6 max-w-4xl text-5xl sm:text-7xl md:text-8xl">
          Run your first table like it&apos;s your fiftieth.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-dim">
          Vendor Starter Hub is the playbook, the toolkit, and the SoCal show calendar for people
          selling trading cards — from first booth to full setup.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/start-here"
            className="rounded bg-sticker px-6 py-3 font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5"
          >
            Start here
          </Link>
          <Link
            href="/tools/profit-calculator"
            className="rounded border border-dim px-6 py-3 font-mono text-sm font-bold uppercase tracking-wide transition hover:-translate-y-0.5 hover:border-ink hover:bg-ink hover:text-paper"
          >
            Try the profit calculator
          </Link>
        </div>
        <p className="mt-6 font-mono text-xs uppercase tracking-wider text-dim">
          Free to read · No fluff · Written table-side
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="display text-3xl sm:text-4xl">What&apos;s on the table</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Link
            href="/start-here"
            className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
          >
            <span className="sticker-muted">Guides</span>
            <h3 className="display mt-4 text-2xl">The playbook</h3>
            <p className="mt-3 text-sm text-dim">
              Sourcing, pricing, booth setup, cash handling, and the tax basics nobody tells you
              before your first show.
            </p>
            <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
              Open →
            </p>
          </Link>
          <Link
            href="/tools"
            className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
          >
            <span className="sticker">Live now</span>
            <h3 className="display mt-4 text-2xl">The toolkit</h3>
            <p className="mt-3 text-sm text-dim">
              A working profit calculator today. Inventory template, show-prep checklist, and price
              labels on the way.
            </p>
            <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
              Open →
            </p>
          </Link>
          <Link
            href="/shows"
            className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
          >
            <span className="sticker-muted">SoCal</span>
            <h3 className="display mt-4 text-2xl">The calendar</h3>
            <p className="mt-3 text-sm text-dim">
              Inland Empire and SoCal card shows with dates, venues, and table costs — verified with
              organizers, kept current.
            </p>
            <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
              Open →
            </p>
          </Link>
        </div>
      </section>

      <section id="waitlist" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="chrome-bar h-1.5 w-full" />
          <div className="p-8 sm:p-12">
            <h2 className="chrome-text display text-4xl sm:text-5xl">
              Coming: the Deal Agent
            </h2>
            <p className="mt-4 max-w-2xl text-dim">
              An assistant that watches listings, checks real comps, and pings you when a deal is
              actually a deal — tuned to what sells at your table. No spam. No auto-buying.
            </p>
            <p className="mt-6 font-mono text-xs uppercase tracking-wider text-dim">
              Waitlist members get the free inventory template first
            </p>
            <div className="mt-4">
              <EmailCapture cta="Get early access" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
