"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { saveShow, deleteShow, type ActionState } from "@/app/dashboard/actions";
import Modal from "@/components/dashboard/modal";
import {
  money,
  fmtDate,
  Sticker,
  Empty,
  Field,
  fieldCls,
  btnPrimary,
  btnGhost,
} from "@/components/dashboard/ui";

type Show = {
  id: string;
  name: string;
  venue: string | null;
  show_date: string | null;
  table_cost: string | number;
  notes: string | null;
};
type SaleRef = {
  show_id: string | null;
  sale_price: string | number;
  cost_basis: string | number;
  fees: string | number;
  quantity: number;
};

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};

function todayLocal(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export default function ShowsClient({
  shows,
  sales,
}: {
  shows: Show[];
  sales: SaleRef[];
}) {
  const [modal, setModal] = useState<Show | "new" | null>(null);
  const [, startTransition] = useTransition();

  const perf = useMemo(() => {
    const m = new Map<string, { rev: number; profit: number; count: number }>();
    for (const s of sales) {
      if (!s.show_id) continue;
      const cur = m.get(s.show_id) ?? { rev: 0, profit: 0, count: 0 };
      cur.rev += n(s.sale_price) * s.quantity;
      cur.profit += (n(s.sale_price) - n(s.cost_basis)) * s.quantity - n(s.fees);
      cur.count += 1;
      m.set(s.show_id, cur);
    }
    return m;
  }, [sales]);

  const today = todayLocal();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
            {shows.length} shows tracked
          </p>
          <h1 className="chrome-text display mt-1 text-4xl sm:text-5xl">Shows</h1>
        </div>
        <button onClick={() => setModal("new")} className={btnPrimary}>
          + Add show
        </button>
      </div>

      {shows.length === 0 ? (
        <div className="mt-8">
          <Empty title="No shows on the books.">
            <p>
              Add each show with its table cost. Tag your sales to it, and
              Vendly tells you — net of the table — which rooms are worth
              driving to.
            </p>
            <button onClick={() => setModal("new")} className={`${btnPrimary} mt-6`}>
              Add your first show
            </button>
          </Empty>
        </div>
      ) : (
        <div className="table-scroll mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-card text-left font-mono text-[11px] uppercase tracking-wider text-dim">
                <th className="px-4 py-2.5 font-bold">Show</th>
                <th className="px-4 py-2.5 font-bold">Date</th>
                <th className="px-4 py-2.5 text-right font-bold">Table</th>
                <th className="px-4 py-2.5 text-right font-bold">Sales</th>
                <th className="px-4 py-2.5 text-right font-bold">Revenue</th>
                <th className="px-4 py-2.5 text-right font-bold">Net</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shows.map((h) => {
                const p = perf.get(h.id);
                const net = p ? p.profit - n(h.table_cost) : null;
                const upcoming = h.show_date != null && h.show_date >= today;
                return (
                  <tr key={h.id} className="transition hover:bg-chip/40">
                    <td className="max-w-[240px] px-4 py-2.5">
                      <p className="truncate">
                        {h.name}{" "}
                        {upcoming ? <Sticker tone="accent">Upcoming</Sticker> : null}
                      </p>
                      {h.venue ? (
                        <p className="truncate text-xs text-dim">{h.venue}</p>
                      ) : null}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-dim">
                      {fmtDate(h.show_date)}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-dim">
                      {money(h.table_cost)}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {p?.count ?? 0}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {p ? money(p.rev) : "—"}
                    </td>
                    <td
                      className={`num px-4 py-2.5 text-right ${
                        net == null
                          ? "text-dim"
                          : net >= 0
                            ? "text-gain"
                            : "text-loss"
                      }`}
                    >
                      {net == null ? "—" : `${net >= 0 ? "+" : ""}${money(net)}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        onClick={() => setModal(h)}
                        className="font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Delete \"${h.name}\"? Sales stay, just untagged from this show.`
                            )
                          )
                            startTransition(() => {
                              deleteShow(h.id);
                            });
                        }}
                        className="ml-3 font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-loss"
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

      {modal !== null && (
        <Modal
          title={modal === "new" ? "Add show" : "Edit show"}
          onClose={() => setModal(null)}
        >
          <ShowForm show={modal === "new" ? null : modal} onDone={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

function ShowForm({ show, onDone }: { show: Show | null; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveShow,
    {}
  );
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-4">
      {show ? <input type="hidden" name="id" value={show.id} /> : null}
      <Field label="Show name" className="col-span-2">
        <input
          name="name"
          required
          defaultValue={show?.name ?? ""}
          placeholder="Ontario Card Show"
          className={fieldCls}
        />
      </Field>
      <Field label="Venue" className="col-span-2">
        <input
          name="venue"
          defaultValue={show?.venue ?? ""}
          placeholder="Ontario Convention Center"
          className={fieldCls}
        />
      </Field>
      <Field label="Date">
        <input
          name="show_date"
          type="date"
          defaultValue={show?.show_date ?? ""}
          className={fieldCls}
        />
      </Field>
      <Field label="Table cost">
        <input
          name="table_cost"
          type="number"
          min={0}
          step="0.01"
          defaultValue={show ? String(show.table_cost) : ""}
          placeholder="0.00"
          className={fieldCls}
        />
      </Field>
      <Field label="Notes" className="col-span-2">
        <textarea
          name="notes"
          rows={2}
          defaultValue={show?.notes ?? ""}
          placeholder="Load-in at 7am. Bring the second showcase."
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
          {pending ? "Saving…" : show ? "Save changes" : "Add show"}
        </button>
      </div>
    </form>
  );
}
