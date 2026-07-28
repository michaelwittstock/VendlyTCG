import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  money,
  fmtDate,
  CATEGORY_LABELS,
  Sticker,
  Empty,
  btnPrimary,
  btnGhost,
} from "@/components/dashboard/ui";

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};

export default async function Overview() {
  const supabase = await createClient();
  const [{ data: salesD }, { data: itemsD }, { data: showsD }] =
    await Promise.all([
      supabase.from("sales").select("*").order("sold_at", { ascending: false }),
      supabase.from("inventory_items").select("*"),
      supabase.from("shows").select("*"),
    ]);
  const sales = salesD ?? [];
  const items = itemsD ?? [];
  const shows = showsD ?? [];

  const profitOf = (s: (typeof sales)[number]) =>
    (n(s.sale_price) - n(s.cost_basis)) * s.quantity - n(s.fees);

  const revenue = sales.reduce((a, s) => a + n(s.sale_price) * s.quantity, 0);
  const profit = sales.reduce((a, s) => a + profitOf(s), 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const cutoff = Date.now() - 30 * 86400000;
  const last30 = sales.filter((s) => new Date(s.sold_at).getTime() >= cutoff);
  const revenue30 = last30.reduce((a, s) => a + n(s.sale_price) * s.quantity, 0);

  const inStock = items.filter((i) => i.status !== "sold_out");
  const stockUnits = inStock.reduce((a, i) => a + i.quantity, 0);
  const stockCost = inStock.reduce((a, i) => a + n(i.cost_basis) * i.quantity, 0);
  const stockAsk = inStock.reduce(
    (a, i) => a + n(i.asking_price ?? i.cost_basis) * i.quantity,
    0
  );

  const cats = new Map<string, { rev: number; prof: number }>();
  for (const s of sales) {
    const c = cats.get(s.category) ?? { rev: 0, prof: 0 };
    c.rev += n(s.sale_price) * s.quantity;
    c.prof += profitOf(s);
    cats.set(s.category, c);
  }
  const catRows = [...cats.entries()].sort((a, b) => b[1].rev - a[1].rev);
  const maxCatRev = Math.max(1, ...catRows.map(([, v]) => v.rev));

  const byShow = new Map<string, number>();
  for (const s of sales)
    if (s.show_id)
      byShow.set(s.show_id, (byShow.get(s.show_id) ?? 0) + profitOf(s));
  const bestShows = shows
    .filter((h) => byShow.has(h.id))
    .map((h) => ({ ...h, net: (byShow.get(h.id) ?? 0) - n(h.table_cost) }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 5);

  const recent = sales.slice(0, 8);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (sales.length === 0 && items.length === 0) {
    return (
      <div>
        <Head today={today} />
        <div className="mt-8">
          <Empty title="Your table is empty — for now.">
            <p>
              Add what&apos;s in your case, log your first sale, and this page
              turns into your numbers: revenue, profit, margins by category,
              and which shows actually pay.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard/inventory" className={btnPrimary}>
                Add inventory
              </Link>
              <Link href="/dashboard/shows" className={btnGhost}>
                Add a show
              </Link>
            </div>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Head today={today} />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Revenue · all time" value={money(revenue)}>
          <span className="num">{money(revenue30)}</span> last 30 days
        </Kpi>
        <Kpi
          label="Profit · all time"
          value={money(profit)}
          valueCls={profit >= 0 ? "text-gain" : "text-loss"}
        >
          after cost basis &amp; fees
        </Kpi>
        <Kpi label="Margin" value={`${margin.toFixed(1)}%`}>
          profit ÷ revenue
        </Kpi>
        <Kpi label="Inventory · at cost" value={money(stockCost)}>
          <span className="num">{stockUnits}</span> units · asks{" "}
          <span className="num">{money(stockAsk)}</span>
        </Kpi>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="display text-2xl">Where the money is</h2>
          {catRows.length === 0 ? (
            <p className="mt-3 text-sm text-dim">
              Log a sale and category margins show up here.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {catRows.map(([cat, v]) => (
                <li key={cat}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs uppercase tracking-wider text-dim">
                      {CATEGORY_LABELS[cat] ?? cat}
                    </span>
                    <span className="num text-sm">
                      {money(v.rev)}{" "}
                      <span
                        className={v.prof >= 0 ? "text-gain" : "text-loss"}
                      >
                        ({v.prof >= 0 ? "+" : ""}
                        {money(v.prof)})
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded bg-chip">
                    <div
                      className="h-1.5 rounded bg-sticker"
                      style={{ width: `${(v.rev / maxCatRev) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="display text-2xl">Best shows</h2>
          {bestShows.length === 0 ? (
            <p className="mt-3 text-sm text-dim">
              Tag sales to a show and the leaderboard builds itself — net of
              table cost.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {bestShows.map((h) => (
                <li
                  key={h.id}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{h.name}</p>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                      {fmtDate(h.show_date)}
                    </p>
                  </div>
                  <span
                    className={`num text-sm ${h.net >= 0 ? "text-gain" : "text-loss"}`}
                  >
                    {h.net >= 0 ? "+" : ""}
                    {money(h.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-2xl">Recent sales</h2>
          <Link
            href="/dashboard/sales"
            className="font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-sticker"
          >
            All sales →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-dim">
            Nothing logged yet.{" "}
            <Link href="/dashboard/sales" className="text-ink underline underline-offset-4">
              Log your first sale
            </Link>{" "}
            — it takes ten seconds.
          </p>
        ) : (
          <div className="table-scroll mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line bg-card text-left font-mono text-[11px] uppercase tracking-wider text-dim">
                  <th className="px-4 py-2.5 font-bold">Date</th>
                  <th className="px-4 py-2.5 font-bold">Item</th>
                  <th className="px-4 py-2.5 text-right font-bold">Qty</th>
                  <th className="px-4 py-2.5 text-right font-bold">Price</th>
                  <th className="px-4 py-2.5 text-right font-bold">Profit</th>
                  <th className="px-4 py-2.5 font-bold">Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((s) => {
                  const p = profitOf(s);
                  return (
                    <tr key={s.id} className="transition hover:bg-chip/40">
                      <td className="num whitespace-nowrap px-4 py-2.5 text-dim">
                        {fmtDate(s.sold_at)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5">
                        {s.item_name}
                      </td>
                      <td className="num px-4 py-2.5 text-right">{s.quantity}</td>
                      <td className="num px-4 py-2.5 text-right">
                        {money(n(s.sale_price) * s.quantity)}
                      </td>
                      <td
                        className={`num px-4 py-2.5 text-right ${p >= 0 ? "text-gain" : "text-loss"}`}
                      >
                        {p >= 0 ? "+" : ""}
                        {money(p)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Sticker tone={s.channel === "show" ? "accent" : "chip"}>
                          {s.channel}
                        </Sticker>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Head({ today }: { today: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
        {today}
      </p>
      <h1 className="chrome-text display mt-1 text-4xl sm:text-5xl">
        Overview
      </h1>
    </div>
  );
}

function Kpi({
  label,
  value,
  valueCls = "",
  children,
}: {
  label: string;
  value: string;
  valueCls?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 sm:p-5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-dim">
        {label}
      </p>
      <p className={`num mt-2 text-2xl sm:text-3xl ${valueCls}`}>{value}</p>
      {children ? <p className="mt-1.5 text-xs text-dim">{children}</p> : null}
    </div>
  );
}
