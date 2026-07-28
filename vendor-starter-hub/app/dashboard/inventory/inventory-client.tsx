"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { saveItem, deleteItem, type ActionState } from "@/app/dashboard/actions";
import Modal from "@/components/dashboard/modal";
import {
  money,
  CATEGORY_LABELS,
  CATS,
  Sticker,
  StatusSticker,
  Empty,
  Field,
  fieldCls,
  btnPrimary,
  btnGhost,
} from "@/components/dashboard/ui";

export type Item = {
  id: string;
  name: string;
  category: string;
  set_name: string | null;
  condition: string | null;
  quantity: number;
  cost_basis: string | number;
  asking_price: string | number | null;
  status: string;
  notes: string | null;
};

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};

export default function InventoryClient({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState<Item | "new" | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== "all" && i.category !== cat) return false;
      if (status !== "all" && i.status !== status) return false;
      if (!needle) return true;
      return [i.name, i.set_name, i.condition, i.notes]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle));
    });
  }, [items, q, cat, status]);

  const totals = useMemo(() => {
    const cost = filtered.reduce((a, i) => a + n(i.cost_basis) * i.quantity, 0);
    const ask = filtered.reduce(
      (a, i) => a + n(i.asking_price ?? i.cost_basis) * i.quantity,
      0
    );
    const units = filtered.reduce((a, i) => a + i.quantity, 0);
    return { cost, ask, units };
  }, [filtered]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
            {items.length} items on record
          </p>
          <h1 className="chrome-text display mt-1 text-4xl sm:text-5xl">
            Inventory
          </h1>
        </div>
        <button onClick={() => setModal("new")} className={btnPrimary}>
          + Add item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-8">
          <Empty title="Nothing in the case yet.">
            <p>
              Add your singles, slabs, and sealed — with cost basis — and
              Vendly starts tracking what your table is actually worth.
            </p>
            <button onClick={() => setModal("new")} className={`${btnPrimary} mt-6`}>
              Add your first item
            </button>
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, set, condition…"
              className={`${fieldCls} min-w-[200px] flex-1`}
            />
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${fieldCls} w-auto`}>
              <option value="all">All categories</option>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${fieldCls} w-auto`}>
              <option value="all">Any status</option>
              <option value="in_stock">In stock</option>
              <option value="listed">Listed</option>
              <option value="sold_out">Sold out</option>
            </select>
          </div>

          <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-dim">
            Showing {filtered.length} · <span className="num">{totals.units}</span> units ·
            cost <span className="num text-ink">{money(totals.cost)}</span> · asking{" "}
            <span className="num text-ink">{money(totals.ask)}</span>
          </p>

          <div className="table-scroll mt-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line bg-card text-left font-mono text-[11px] uppercase tracking-wider text-dim">
                  <th className="px-4 py-2.5 font-bold">Item</th>
                  <th className="px-4 py-2.5 font-bold">Category</th>
                  <th className="px-4 py-2.5 font-bold">Cond.</th>
                  <th className="px-4 py-2.5 text-right font-bold">Qty</th>
                  <th className="px-4 py-2.5 text-right font-bold">Cost</th>
                  <th className="px-4 py-2.5 text-right font-bold">Asking</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((i) => (
                  <tr key={i.id} className="transition hover:bg-chip/40">
                    <td className="max-w-[240px] px-4 py-2.5">
                      <p className="truncate">{i.name}</p>
                      {i.set_name ? (
                        <p className="truncate text-xs text-dim">{i.set_name}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Sticker>{CATEGORY_LABELS[i.category] ?? i.category}</Sticker>
                    </td>
                    <td className="px-4 py-2.5 text-dim">{i.condition ?? "—"}</td>
                    <td className="num px-4 py-2.5 text-right">{i.quantity}</td>
                    <td className="num px-4 py-2.5 text-right text-dim">
                      {money(i.cost_basis)}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {i.asking_price == null ? "—" : money(i.asking_price)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusSticker status={i.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        onClick={() => setModal(i)}
                        className="font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(`Delete \"${i.name}\"? Sales history is kept.`)
                          )
                            startTransition(() => {
                              deleteItem(i.id);
                            });
                        }}
                        className="ml-3 font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-loss"
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal !== null && (
        <Modal
          title={modal === "new" ? "Add item" : "Edit item"}
          onClose={() => setModal(null)}
        >
          <ItemForm item={modal === "new" ? null : modal} onDone={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

function ItemForm({ item, onDone }: { item: Item | null; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveItem,
    {}
  );
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <Field label="Name" className="col-span-2">
        <input
          name="name"
          required
          defaultValue={item?.name ?? ""}
          placeholder="Charizard ex 199/165"
          className={fieldCls}
        />
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={item?.category ?? "single"} className={fieldCls}>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={item?.status ?? "in_stock"} className={fieldCls}>
          <option value="in_stock">In stock</option>
          <option value="listed">Listed</option>
          <option value="sold_out">Sold out</option>
        </select>
      </Field>
      <Field label="Set">
        <input
          name="set_name"
          defaultValue={item?.set_name ?? ""}
          placeholder="151"
          className={fieldCls}
        />
      </Field>
      <Field label="Condition / grade">
        <input
          name="condition"
          defaultValue={item?.condition ?? ""}
          placeholder="NM · PSA 10 · LP"
          className={fieldCls}
        />
      </Field>
      <Field label="Quantity">
        <input
          name="quantity"
          type="number"
          min={0}
          step={1}
          defaultValue={item?.quantity ?? 1}
          className={fieldCls}
        />
      </Field>
      <Field label="Cost basis · per unit">
        <input
          name="cost_basis"
          type="number"
          min={0}
          step="0.01"
          defaultValue={item ? String(item.cost_basis) : ""}
          placeholder="0.00"
          className={fieldCls}
        />
      </Field>
      <Field label="Asking price · per unit" className="col-span-2">
        <input
          name="asking_price"
          type="number"
          min={0}
          step="0.01"
          defaultValue={item?.asking_price == null ? "" : String(item.asking_price)}
          placeholder="Leave blank if unpriced"
          className={fieldCls}
        />
      </Field>
      <Field label="Notes" className="col-span-2">
        <textarea
          name="notes"
          rows={2}
          defaultValue={item?.notes ?? ""}
          placeholder="Pulled from a collection buy in Ontario…"
          className={fieldCls}
        />
      </Field>
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
          {pending ? "Saving…" : item ? "Save changes" : "Add item"}
        </button>
      </div>
    </form>
  );
}
