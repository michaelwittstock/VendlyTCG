"use client";

import { useState } from "react";
import Image from "next/image";
import type { PriceCard } from "@/lib/prices";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (n: number | null) => (n === null ? "—" : usd.format(n));

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; cards: PriceCard[]; total: number; stale: boolean; query: string };

/** The number a vendor actually needs: what to pay to keep `margin` on resale. */
function maxBuy(market: number | null, margin: number): number | null {
  if (market === null) return null;
  return market * (1 - margin / 100);
}

function CardRow({ card, margin }: { card: PriceCard; margin: number }) {
  const top = card.finishes[0] ?? null;
  const buy = maxBuy(top?.market ?? top?.low ?? null, margin);

  return (
    <li className="rounded-lg border border-line bg-card p-5">
      <div className="flex gap-4">
        {card.image ? (
          <Image
            src={card.image}
            alt=""
            width={72}
            height={100}
            className="h-25 w-18 shrink-0 rounded border border-line object-contain"
            unoptimized
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="display text-xl leading-tight">{card.name}</h3>
          <p className="mt-1 font-mono text-xs text-dim">
            {card.setName} · #{card.number}
            {card.rarity ? ` · ${card.rarity}` : ""}
          </p>

          {top ? (
            <div className="mt-4 rounded border border-line bg-paper p-3">
              <p className="font-mono text-[0.65rem] uppercase tracking-wider text-dim">
                Pay up to · {margin}% margin · {top.label}
              </p>
              <p className="display mt-1 text-4xl text-sticker">{money(buy)}</p>
            </div>
          ) : null}
        </div>
      </div>

      {card.finishes.length ? (
        <table className="mt-4 w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="text-left text-[0.65rem] uppercase tracking-wider text-dim">
              <th className="border-b border-line py-2 font-normal">Finish</th>
              <th className="border-b border-line py-2 text-right font-normal">Low</th>
              <th className="border-b border-line py-2 text-right font-normal">Market</th>
              <th className="border-b border-line py-2 text-right font-normal">High</th>
            </tr>
          </thead>
          <tbody>
            {card.finishes.map((f) => (
              <tr key={f.label}>
                <td className="border-b border-line py-2">{f.label}</td>
                <td className="border-b border-line py-2 text-right text-dim">{money(f.low)}</td>
                <td className="border-b border-line py-2 text-right font-bold">{money(f.market)}</td>
                <td className="border-b border-line py-2 text-right text-dim">{money(f.high)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-4 text-sm text-dim">
          No TCGplayer pricing published for this card yet.
        </p>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dim">
        {card.updatedAt ? <span>Prices as of {card.updatedAt}</span> : null}
        {card.url ? (
          <a href={card.url} target="_blank" rel="noopener noreferrer" className="underline">
            See listings on TCGplayer →
          </a>
        ) : null}
      </p>
    </li>
  );
}

export default function Checker() {
  const [query, setQuery] = useState("");
  const [margin, setMargin] = useState(40);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setState({ kind: "error", message: "Type at least two characters." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/prices?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const message =
          json?.error === "empty_query"
            ? "Type at least two characters."
            : json?.error === "busy"
              ? "Too many lookups at once — give it about 30 seconds and try again."
              : "The price service did not answer. It does that occasionally — try again in a moment.";
        setState({ kind: "error", message });
        return;
      }
      setState({
        kind: "done",
        cards: json.cards,
        total: json.total,
        stale: Boolean(json.stale),
        query: q,
      });
    } catch {
      setState({ kind: "error", message: "Could not reach the price service. Check your connection." });
    }
  }

  return (
    <div>
      <form onSubmit={search} className="rounded-lg border border-line bg-card p-6">
        <label className="block">
          <span className="font-mono text-xs uppercase tracking-wider text-dim">Card name</span>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Charizard ex"
              maxLength={60}
              className="w-full rounded border border-line bg-paper px-3 py-3 font-mono text-lg outline-none"
            />
            <button
              type="submit"
              disabled={state.kind === "loading"}
              className="shrink-0 rounded bg-sticker px-6 py-3 font-mono text-sm font-bold uppercase tracking-wider text-onaccent disabled:opacity-60"
            >
              {state.kind === "loading" ? "Checking…" : "Check price"}
            </button>
          </div>
        </label>

        <label className="mt-6 block">
          <span className="font-mono text-xs uppercase tracking-wider text-dim">
            Margin you want on resale · {margin}%
          </span>
          <input
            type="range"
            min={10}
            max={70}
            step={5}
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="mt-2 w-full accent-sticker"
          />
          <span className="mt-1 block text-xs text-dim">
            Sets the &ldquo;pay up to&rdquo; number. 40% is a common floor once you price in the
            table fee and the cards that never sell.
          </span>
        </label>
      </form>

      {state.kind === "error" ? (
        <p className="mt-6 rounded-lg border border-line bg-card p-5 text-sm text-loss">
          {state.message}
        </p>
      ) : null}

      {state.kind === "done" ? (
        state.cards.length === 0 ? (
          <div className="mt-6 rounded-lg border border-line bg-card p-5">
            <p className="text-sm">
              Nothing matched <span className="font-mono">{state.query}</span>.
            </p>
            <p className="mt-2 text-sm text-dim">
              Search the printed card name, not a nickname — &ldquo;Umbreon VMAX&rdquo;, not
              &ldquo;Moonbreon&rdquo;. Sealed product is not covered.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-8 font-mono text-xs uppercase tracking-wider text-dim">
              {state.total} match{state.total === 1 ? "" : "es"}
              {state.total > state.cards.length ? ` · newest ${state.cards.length} shown` : ""}
            </p>
            {state.stale ? (
              <p className="mt-2 text-xs text-loss">
                Live lookup failed — showing the last prices we cached. They may be a few days old.
              </p>
            ) : null}
            <ul className="mt-4 space-y-4">
              {state.cards.map((c) => (
                <CardRow key={c.id} card={c} margin={margin} />
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
}
