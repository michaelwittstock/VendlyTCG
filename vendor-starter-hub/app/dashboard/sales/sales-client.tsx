"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { logSale, deleteSale, type ActionState } from "@/app/dashboard/actions";
import Modal from "@/components/dashboard/modal";
import {
  money,
  fmtDate,
  CATEGORY_LABELS,
  CATS,
  Sticker,
  Empty,
  Field,
  fieldCls,
  btnPrimary,
  btnGhost,
} from "@/components/dashboard/ui";

type Sale = {
  id: string;
  item_name: string;
  category: string;
  quantity: number;
  sale_price: string | number;
  cost_basis: string | number;
  fees: string | number;
  channel: string;
  sold_at: string;
  customer_id: string | null;
  show_id: string | null;
  notes: string | null;
};
type PickItem = {
  id: string;
  name: string;
  set_name: string | null;
  quantity: number;
  cost_basis: string | number;
  asking_price: string | number | null;
  category: string;
};
type Ref = { id: string; name: string; show_date?: string | null };

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};

export default function SalesClient({
  sales,
  items,
  customers,
  shows,
}: {
  sales: Sale[];
  items: PickItem[];
  customers: Ref[];
  shows: Ref[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const customerName = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers]
  );
  const showName = useMemo(
    () => new Map(shows.map((s) => [s.id, s.name])),
    [shows]
  );

  const profitOf = (s: Sale) =>
    (n(s.sale_price) - n(s.cost_basis)) * s.quantity - n(s.fees);
  const totalRev = sales.reduce((a, s) => a + n(s.sale_price) * s.quantity, 0);
  const totalProfit = sales.reduce((a, s) => a + profitOf(s), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
            {sales.length} sales · <span className="num">{money(totalRev)}</span>{" "}
            revenue ·{" "}
            <span className={`num ${totalProfit >= 0 ? "text-gain" : "text-loss"}`}>
              {totalProfit >= 0 ? "+" : ""}
              {money(totalProfit)}
            </span>{" "}
            profit
          </p>
          <h1 className="chrome-text display mt-1 text-4xl sm:text-5xl">Sales</h1>
        </div>
        <button onClick={() => setOpen(true)} className={btnPrimary}>
          + Log sale
        </button>
      </div>

      {sales.length === 0 ? (
        <div className="mt-8">
          <Empty title="No sales logged yet.">
            <p>
              Log each sale as it happens — ten seconds table-side — and your
              profit, margins, and best shows calculate themselves.
            </p>
            <button onClick={() => setOpen(true)} className={`${btnPrimary} mt-6`}>
              Log your first sale
            </button>
          </Empty>
        </div>
      ) : (
        <div className="table-scroll mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line bg-card text-left font-mono text-[11px] uppercase tracking-wider text-dim">
                <th className="px-4 py-2.5 font-bold">Date</th>
                <th className="px-4 py-2.5 font-bold">Item</th>
                <th className="px-4 py-2.5 text-right font-bold">Qty</th>
                <th className="px-4 py-2.5 text-right font-bold">Total</th>
                <th className="px-4 py-2.5 text-right font-bold">Fees</th>
                <th className="px-4 py-2.5 text-right font-bold">Profit</th>
                <th className="px-4 py-2.5 font-bold">Channel</th>
                <th className="px-4 py-2.5 font-bold">Tagged</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sales.map((s) => {
                const p = profitOf(s);
                const tags = [
                  s.show_id ? showName.get(s.show_id) : null,
                  s.customer_id ? customerName.get(s.customer_id) : null,
                ].filter(Boolean);
                return (
                  <tr key={s.id} className="transition hover:bg-chip/40">
                    <td className="num whitespace-nowrap px-4 py-2.5 text-dim">
                      {fmtDate(s.sold_at)}
                    </td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      <p className="truncate">{s.item_name}</p>
                      <p className="text-[11px] uppercase tracking-wider text-dim">
                        {CATEGORY_LABELS[s.category] ?? s.category}
                      </p>
                    </td>
                    <td className="num px-4 py-2.5 text-right">{s.quantity}</td>
                    <td className="num px-4 py-2.5 text-right">
                      {money(n(s.sale_price) * s.quantity)}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-dim">
                      {n(s.fees) ? money(s.fees) : "—"}
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
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-xs text-dim">
                      {tags.length ? tags.join(" · ") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Delete this sale? This won't restock inventory."
                            )
                          )
                            startTransition(() => {
                              deleteSale(s.id);
                            });
                        }}
                        className="font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-loss"
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title="Log sale" onClose={() => setOpen(false)}>
          <SaleForm
            items={items}
            customers={customers}
            shows={shows}
            onDone={() => setOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function SaleForm({
  items,
  customers,
  shows,
  onDone,
}: {
  items: PickItem[];
  customers: Ref[];
  shows: Ref[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    logSale,
    {}
  );
  const [mode, setMode] = useState<"inventory" | "quick">(
    items.length > 0 ? "inventory" : "quick"
  );
  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  const picked = items.find((i) => i.id === itemId) ?? null;

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <form action={formAction} className="grid grid-cols-2 gap-4">
      <div className="col-span-2 flex gap-1 rounded bg-chip p-1">
        {(["inventory", "quick"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition ${
              mode === m ? "bg-card text-ink" : "text-dim hover:text-ink"
            }`}
          >
            {m === "inventory" ? "From inventory" : "Quick sale"}
          </button>
        ))}
      </div>

      {mode === "inventory" ? (
        <Field label="Item" className="col-span-2">
          <select
            name="item_id"
            required
            value={itemId}
            onChange={(e) => {
              const id = e.target.value;
              setItemId(id);
              const it = items.find((i) => i.id === id);
              if (it) {
                setPrice(String(n(it.asking_price ?? it.cost_basis) || ""));
                setQty("1");
              }
            }}
            className={fieldCls}
          >
            <option value="" disabled>
              {items.length ? "Pick from your case…" : "No in-stock items"}
            </option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.set_name ? ` · ${i.set_name}` : ""} — {i.quantity} left
                {i.asking_price != null ? ` — asks ${money(i.asking_price)}` : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="What sold" className="col-span-2">
            <input
              name="item_name"
              required
              placeholder="Mystery pack, bulk lot…"
              className={fieldCls}
            />
          </Field>
          <Field label="Category">
            <select name="category" defaultValue="other" className={fieldCls}>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cost basis · per unit">
            <input
              name="cost_basis"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              className={fieldCls}
            />
          </Field>
        </>
      )}

      <Field label="Quantity">
        <input
          name="quantity"
          type="number"
          min={1}
          max={mode === "inventory" && picked ? picked.quantity : undefined}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className={fieldCls}
        />
      </Field>
      <Field label="Sale price · per unit">
        <input
          name="sale_price"
          type="number"
          required
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.00"
          className={fieldCls}
        />
      </Field>
      <Field label="Fees · total">
        <input
          name="fees"
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          className={fieldCls}
        />
      </Field>
      <Field label="Channel">
        <select name="channel" defaultValue="show" className={fieldCls}>
          <option value="show">Show</option>
          <option value="online">Online</option>
          <option value="local">Local</option>
        </select>
      </Field>
      <Field label="Show · optional">
        <select name="show_id" defaultValue="" className={fieldCls}>
          <option value="">—</option>
          {shows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.show_date ? ` · ${fmtDate(s.show_date)}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Customer · optional">
        <select name="customer_id" defaultValue="" className={fieldCls}>
          <option value="">—</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input
          name="sold_at"
          type="date"
          defaultValue={localDate}
          className={fieldCls}
        />
      </Field>
      <Field label="Notes">
        <input name="notes" placeholder="Optional" className={fieldCls} />
      </Field>

      {picked && (
        <p className="col-span-2 font-mono text-[11px] uppercase tracking-wider text-dim">
          {picked.quantity} in stock · cost {money(picked.cost_basis)}/unit —
          quantity comes off inventory automatically.
        </p>
      )}

      {state.error && (
        <p className="col-span-2 rounded border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      <div className="col-span-2 mt-1 flex justify-end gap-2">
        <button type="button" onClick={onDone} className={btnGhost}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Logging…" : "Log sale"}
        </button>
      </div>
    </form>
  );
}
