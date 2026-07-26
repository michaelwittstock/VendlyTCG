"use client";

import { useState } from "react";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-xs uppercase tracking-wider text-dim">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded border border-line bg-paper px-3">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-full bg-transparent py-3 font-mono text-lg outline-none"
        />
        {suffix ? <span className="font-mono text-sm text-dim">{suffix}</span> : null}
      </div>
    </label>
  );
}

export default function Calculator() {
  const [tableFee, setTableFee] = useState(80);
  const [misc, setMisc] = useState(40);
  const [gross, setGross] = useState(600);
  const [cogsPct, setCogsPct] = useState(60);

  const fixed = tableFee + misc;
  const ratio = 1 - cogsPct / 100;
  const cogs = (gross * cogsPct) / 100;
  const net = gross - cogs - fixed;
  const breakEven = ratio > 0 ? fixed / ratio : Infinity;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-5 rounded-lg border border-line bg-card p-6">
        <Field label="Table fee" value={tableFee} onChange={setTableFee} suffix="$" />
        <Field label="Travel + misc costs" value={misc} onChange={setMisc} suffix="$" />
        <Field label="Expected gross sales" value={gross} onChange={setGross} suffix="$" />
        <Field label="Cost of goods (% of sale price)" value={cogsPct} onChange={setCogsPct} suffix="%" />
      </div>
      <div className="rounded-lg border border-line bg-card p-6">
        <dl className="space-y-4 font-mono text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-dim">Cost of goods sold</dt>
            <dd>{usd.format(cogs)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-dim">Table + costs</dt>
            <dd>{usd.format(fixed)}</dd>
          </div>
          <div className="border-t border-line pt-4">
            <dt className="text-dim">Net profit</dt>
            <dd className={`display mt-1 text-5xl ${net < 0 ? "text-sticker" : ""}`}>
              {usd.format(net)}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <dt className="text-dim">Break-even gross sales</dt>
            <dd className="font-bold">{Number.isFinite(breakEven) ? usd.format(breakEven) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-6 text-xs text-dim">
          Rule of thumb: if your realistic gross is under break-even × 1.5, negotiate the table
          cost, split it with a partner, or bring hotter inventory.
        </p>
      </div>
    </div>
  );
}
