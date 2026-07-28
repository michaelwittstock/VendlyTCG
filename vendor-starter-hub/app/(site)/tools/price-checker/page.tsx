import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/email-capture";
import Checker from "./checker";

export const metadata: Metadata = {
  title: "Card price checker",
  description:
    "Look up TCGplayer market, low, and high prices for any Pokémon card — and see the most you can pay and still hit your margin at a show.",
};

export default function PriceChecker() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <span className="sticker">Free tool</span>
      <h1 className="chrome-text display mt-5 text-5xl sm:text-6xl">Card price checker</h1>
      <p className="mt-5 max-w-xl text-lg text-dim">
        Market, low, and high on any Pokémon card — plus the number that actually matters across a
        table: the most you can pay and still make your margin.
      </p>

      <div className="mt-10">
        <Checker />
      </div>

      <section className="mt-14">
        <h2 className="display text-3xl">Using this across the table</h2>
        <p className="mt-4 text-dim">
          Someone hands you a binder and asks what you&rsquo;ll give them. Market price is the
          wrong answer to say out loud — it&rsquo;s what the card sells for, not what it&rsquo;s
          worth to you. What you can pay is market minus your margin, and your margin has to cover
          the table fee, the gas, the cards that sit in the case for a year, and your time.
        </p>
        <p className="mt-4 text-dim">
          That&rsquo;s what the slider does. Set the margin you need, and the{" "}
          <span className="text-ink">pay up to</span> number is your ceiling. Offer under it. If
          the seller won&rsquo;t go there, you pass — there is another binder behind them.
        </p>
        <ul className="mt-6 space-y-3 text-dim">
          <li>
            <span className="text-ink">Check the finish.</span> Reverse holo and holo versions of
            the same card can be worth wildly different money. The table lists each separately.
          </li>
          <li>
            <span className="text-ink">Watch the low-to-high spread.</span> A tight spread means a
            liquid card you can move. A huge spread usually means condition is doing the work, and
            the high end is graded or mispriced.
          </li>
          <li>
            <span className="text-ink">Market beats high, always.</span> High is one optimistic
            listing. Market is what people actually paid.
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="display text-3xl">What this does and doesn&rsquo;t cover</h2>
        <ul className="mt-4 space-y-3 text-dim">
          <li>
            <span className="text-ink">Pokémon singles only, for now.</span> Magic, Yu-Gi-Oh, One
            Piece and Lorcana are on the list.
          </li>
          <li>
            <span className="text-ink">No sealed product.</span> Booster boxes and ETBs
            aren&rsquo;t in the card database. Price those off completed sales.
          </li>
          <li>
            <span className="text-ink">Raw, not graded.</span> These are TCGplayer prices for
            ungraded cards. A PSA 10 is a different market.
          </li>
          <li>
            <span className="text-ink">Prices refresh daily, not live.</span> Each result shows its
            own date. On a fast-moving card, treat it as a starting point.
          </li>
        </ul>
        <p className="mt-6 text-sm text-dim">
          Pricing data from the Pokémon TCG API, sourced from TCGplayer. Not affiliated with,
          endorsed by, or produced by Nintendo, The Pokémon Company, or TCGplayer.
        </p>
      </section>

      <section className="mt-14 grid gap-5 sm:grid-cols-2">
        <Link
          href="/tools/profit-calculator"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <h3 className="display text-2xl">Work out the margin you need</h3>
          <p className="mt-3 text-sm text-dim">
            Table fee, travel, and cost of goods → the margin that actually clears a profit.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Profit calculator →
          </p>
        </Link>
        <Link
          href="/tools/inventory-template"
          className="group rounded-lg border border-line bg-card p-6 transition hover:-translate-y-1"
        >
          <h3 className="display text-2xl">Log what you paid</h3>
          <p className="mt-3 text-sm text-dim">
            The free spreadsheet that tracks cost basis, so profit per card isn&rsquo;t a guess.
          </p>
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider group-hover:text-sticker">
            Inventory template →
          </p>
        </Link>
      </section>

      <div className="mt-14 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Multi-game pricing is coming
        </p>
        <p className="mt-2 text-sm text-dim">
          Magic, Yu-Gi-Oh, One Piece and Lorcana next. The list hears first.
        </p>
        <div className="mt-4">
          <EmailCapture cta="Join the list" source="price-checker" />
        </div>
      </div>
    </div>
  );
}
