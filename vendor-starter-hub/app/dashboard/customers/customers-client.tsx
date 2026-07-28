"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  saveCustomer,
  deleteCustomer,
  type ActionState,
} from "@/app/dashboard/actions";
import Modal from "@/components/dashboard/modal";
import {
  money,
  Empty,
  Field,
  fieldCls,
  btnPrimary,
  btnGhost,
} from "@/components/dashboard/ui";

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  collects: string | null;
  notes: string | null;
};
type SaleRef = {
  customer_id: string | null;
  sale_price: string | number;
  quantity: number;
};

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};

export default function CustomersClient({
  customers,
  sales,
}: {
  customers: Customer[];
  sales: SaleRef[];
}) {
  const [modal, setModal] = useState<Customer | "new" | null>(null);
  const [, startTransition] = useTransition();

  const spend = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const s of sales) {
      if (!s.customer_id) continue;
      const cur = m.get(s.customer_id) ?? { total: 0, count: 0 };
      cur.total += n(s.sale_price) * s.quantity;
      cur.count += 1;
      m.set(s.customer_id, cur);
    }
    return m;
  }, [sales]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
            {customers.length} regulars on file
          </p>
          <h1 className="chrome-text display mt-1 text-4xl sm:text-5xl">
            Customers
          </h1>
        </div>
        <button onClick={() => setModal("new")} className={btnPrimary}>
          + Add customer
        </button>
      </div>

      {customers.length === 0 ? (
        <div className="mt-8">
          <Empty title="No regulars yet.">
            <p>
              The vendor who remembers what you collect is the vendor you come
              back to. Save your repeat buyers and what they hunt for.
            </p>
            <button onClick={() => setModal("new")} className={`${btnPrimary} mt-6`}>
              Add your first customer
            </button>
          </Empty>
        </div>
      ) : (
        <div className="table-scroll mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line bg-card text-left font-mono text-[11px] uppercase tracking-wider text-dim">
                <th className="px-4 py-2.5 font-bold">Name</th>
                <th className="px-4 py-2.5 font-bold">Contact</th>
                <th className="px-4 py-2.5 font-bold">Collects</th>
                <th className="px-4 py-2.5 text-right font-bold">Purchases</th>
                <th className="px-4 py-2.5 text-right font-bold">Spent</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {customers.map((c) => {
                const s = spend.get(c.id);
                return (
                  <tr key={c.id} className="transition hover:bg-chip/40">
                    <td className="max-w-[200px] px-4 py-2.5">
                      <p className="truncate">{c.name}</p>
                      {c.notes ? (
                        <p className="truncate text-xs text-dim">{c.notes}</p>
                      ) : null}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-dim">
                      {c.contact ?? "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5">
                      {c.collects ?? "—"}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {s?.count ?? 0}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      {s ? money(s.total) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        onClick={() => setModal(c)}
                        className="font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Remove \"${c.name}\"? Their sales stay on the books.`
                            )
                          )
                            startTransition(() => {
                              deleteCustomer(c.id);
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
          title={modal === "new" ? "Add customer" : "Edit customer"}
          onClose={() => setModal(null)}
        >
          <CustomerForm
            customer={modal === "new" ? null : modal}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function CustomerForm({
  customer,
  onDone,
}: {
  customer: Customer | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCustomer,
    {}
  );
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <Field label="Name">
        <input
          name="name"
          required
          defaultValue={customer?.name ?? ""}
          placeholder="Alex — the Charizard guy"
          className={fieldCls}
        />
      </Field>
      <Field label="Contact">
        <input
          name="contact"
          defaultValue={customer?.contact ?? ""}
          placeholder="IG @handle · phone · email"
          className={fieldCls}
        />
      </Field>
      <Field label="Collects">
        <input
          name="collects"
          defaultValue={customer?.collects ?? ""}
          placeholder="Vintage WOTC, PSA 9+ Charizards"
          className={fieldCls}
        />
      </Field>
      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          defaultValue={customer?.notes ?? ""}
          placeholder="Comes to Ontario shows. Text before listing big slabs."
          className={fieldCls}
        />
      </Field>
      {state.error && (
        <p className="rounded border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      <div className="mt-1 flex justify-end gap-2">
        <button type="button" onClick={onDone} className={btnGhost}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : customer ? "Save changes" : "Add customer"}
        </button>
      </div>
    </form>
  );
}
