import { type ReactNode } from "react";

/* ---------- formatters ---------- */

export function money(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  const safe = Number.isFinite(n) ? (n as number) : 0;
  return safe.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  // date-only strings ("2026-07-27") must not shift a day across timezones
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10))
    : new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const CATEGORY_LABELS: Record<string, string> = {
  single: "Singles",
  sealed: "Sealed",
  slab: "Slabs",
  supplies: "Supplies",
  other: "Other",
};

export const CATS = ["single", "sealed", "slab", "supplies", "other"] as const;

/* ---------- stickers (status + label chips) ---------- */

const tones = {
  chip: "bg-chip text-ink",
  dim: "bg-chip text-dim",
  accent: "bg-sticker text-onaccent",
  gain: "bg-gain/15 text-gain",
  loss: "bg-loss/15 text-loss",
} as const;

export function Sticker({
  children,
  tone = "chip",
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusSticker({ status }: { status: string }) {
  if (status === "sold_out") return <Sticker tone="dim">Sold out</Sticker>;
  if (status === "listed") return <Sticker tone="accent">Listed</Sticker>;
  return <Sticker tone="gain">In stock</Sticker>;
}

/* ---------- shared form + button classes ---------- */

export const fieldCls =
  "w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-dim/70 focus:border-sticker focus:outline-none";
export const labelCls =
  "font-mono text-[11px] font-bold uppercase tracking-wider text-dim";
export const btnPrimary =
  "rounded bg-sticker px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-onaccent transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60";
export const btnGhost =
  "rounded border border-line px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:border-ink hover:text-ink";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

/* ---------- empty state ---------- */

export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card/50 px-6 py-14 text-center">
      <p className="display text-2xl">{title}</p>
      <div className="mx-auto mt-2 max-w-md text-sm text-dim">{children}</div>
    </div>
  );
}
