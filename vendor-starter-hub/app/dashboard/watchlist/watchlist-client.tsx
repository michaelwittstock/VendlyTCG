"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  saveWatch,
  deleteWatch,
  setWatchActive,
  type ActionState,
} from "@/app/dashboard/actions";
import Modal from "@/components/dashboard/modal";
import {
  money,
  Empty,
  Field,
  Sticker,
  fieldCls,
  btnPrimary,
  btnGhost,
} from "@/components/dashboard/ui";
import { ceiling, sortKey, type WatchStatus } from "@/lib/watchlist";
import type { PriceCard } from "@/lib/prices";
import {
  sparkPath,
  MIN_POINTS_FOR_LINE,
  WINDOW_DAYS,
  type Trend,
} from "@/lib/price-history";
import DraftMessage, { type NextShow } from "./draft-message";

export type WatchRow = {
  id: string;
  card_id: string;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  finish: string | null;
  notes: string | null;
  active: boolean;
  target_kind: "price" | "percent";
  target_price: number | null;
  target_pct: number | null;
  market_at_add: number | null;

  finishLabel: string | null;
  finishMissing: boolean;
  unresolved: "not_found" | "unavailable" | null;
  market: number | null;
  stale: boolean;
  status: WatchStatus;
  drift: { abs: number; pct: number } | null;
  trend: Trend;
  tcgUrl: string | null;
  pricedAt: string | null;
};

export type LastRun = {
  finished_at: string;
  status: string;
  rows_written: number;
} | null;

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function StatusCell({ row }: { row: WatchRow }) {
  if (!row.active) return <Sticker tone="dim">Paused</Sticker>;
  if (row.unresolved === "unavailable")
    return (
      <span title="The price service did not answer. Your watch is fine — reload in a minute.">
        <Sticker tone="dim">Price unavailable</Sticker>
      </span>
    );
  if (row.unresolved === "not_found")
    return (
      <span title="The price provider answered and has no such card. It may have been withdrawn or re-indexed.">
        <Sticker tone="dim">Card not found</Sticker>
      </span>
    );
  if (row.finishMissing)
    return (
      <span title={`No "${row.finish}" printing is priced for this card right now.`}>
        <Sticker tone="dim">Finish unpriced</Sticker>
      </span>
    );

  switch (row.status.kind) {
    case "in_range":
      return <Sticker tone="gain">Buy · {money(row.status.under)} under</Sticker>;
    case "above":
      return <Sticker tone="dim">{money(row.status.over)} over</Sticker>;
    case "pay_up_to":
      return <Sticker tone="accent">Pay up to {money(row.status.ceiling)}</Sticker>;
    case "no_price":
      return <Sticker tone="dim">No price</Sticker>;
  }
}

const SPARK_W = 68;
const SPARK_H = 22;

/**
 * The recorded price line for one card and finish.
 *
 * Scaled to its own range, not to zero, so a $2 move on a $90 card is visible.
 * That is the right call for a 68-pixel line whose only job is "which way, how
 * steadily" — and it is exactly why the tooltip carries the real high and low,
 * because the shape on its own would let you misread the size of a move.
 */
function Sparkline({ t }: { t: Trend }) {
  const d = sparkPath(t.points, SPARK_W, SPARK_H);
  if (!d) return null;

  const rising = (t.change?.abs ?? 0) > 0;
  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className={rising ? "text-dim" : "text-gain"}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Today's price against the last 30 recorded days.
 *
 * Every branch below says how many days it is speaking for. An "average" over
 * three days and one over thirty are different claims, and a vendor about to
 * pay money on the strength of one is owed the difference. Nothing here is
 * filled in, smoothed or extrapolated.
 */
function TrendCell({ row }: { row: WatchRow }) {
  const t = row.trend;

  if (!row.active) return <span className="text-dim">—</span>;

  if (t.days === 0)
    return (
      <span
        className="text-xs text-dim"
        title="No days recorded for this card and finish yet. The snapshot runs once a day; a card added today has its first point tomorrow."
      >
        Not recorded yet
      </span>
    );

  if (t.days < MIN_POINTS_FOR_LINE)
    return (
      <span
        className="text-xs text-dim"
        title="One recorded day is a dot, not a trend. Drawing a line through it would imply a month of stability nobody measured."
      >
        1 day so far
      </span>
    );

  const v = t.vsAverage;
  return (
    <div className="flex items-center gap-2">
      <Sparkline t={t} />
      <span
        className="leading-tight"
        title={`${t.days} recorded ${t.days === 1 ? "day" : "days"} · low ${money(
          t.low,
        )} · high ${money(t.high)} · average ${money(t.average)}`}
      >
        {v ? (
          <span className={`num text-xs ${v.pct < 0 ? "text-gain" : "text-dim"}`}>
            {pct(v.pct)} vs avg
          </span>
        ) : (
          <span className="num text-xs text-dim">avg {money(t.average)}</span>
        )}
        <span className="block text-[11px] text-dim">
          {t.days}d recorded
        </span>
      </span>
    </div>
  );
}

/**
 * When the record was last brought up to date, said out loud.
 *
 * A snapshot job that quietly stops looks exactly like a market that stopped
 * moving: a flat line. This is the sentence that tells the two apart, so it is
 * not decoration and should not be removed to tidy the page up.
 *
 * The staleness check runs after mount on purpose. "How long ago" depends on
 * the current clock, which differs between the server render and the browser,
 * and a hydration mismatch on a warning label is a good way to lose the
 * warning.
 */
function LastRunNote({ run }: { run: LastRun }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!run?.finished_at) return;
    const ageHours = (Date.now() - new Date(run.finished_at).getTime()) / 3_600_000;
    // The job runs daily, so anything past ~36h has missed a turn.
    setStale(ageHours > 36);
  }, [run]);

  if (!run?.finished_at)
    return (
      <span className="text-loss">
        The daily record has not run yet, so no trends exist so far.
      </span>
    );

  const when = new Date(run.finished_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <span className={stale ? "text-loss" : undefined}>
      Last recorded {when}
      {stale
        ? " — that is more than a day ago, so these lines are behind. The daily job may have stopped."
        : "."}
    </span>
  );
}

function TargetCell({ row }: { row: WatchRow }) {
  if (row.target_kind === "price")
    return (
      <>
        <span className="num">{money(row.target_price)}</span>
        <span className="block text-xs text-dim">fixed ceiling</span>
      </>
    );
  const c = ceiling(row, row.market);
  return (
    <>
      <span className="num">{row.target_pct}% under</span>
      <span className="block text-xs text-dim">
        {c === null ? "needs a market price" : `= ${money(c)} today`}
      </span>
    </>
  );
}

export default function WatchlistClient({
  rows,
  degraded,
  lastRun,
  nextShow,
}: {
  rows: WatchRow[];
  degraded: boolean;
  lastRun: LastRun;
  nextShow: NextShow;
}) {
  const [modal, setModal] = useState<WatchRow | "new" | null>(null);
  const [draftRow, setDraftRow] = useState<WatchRow | null>(null);
  const [showPaused, setShowPaused] = useState(true);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    const list = showPaused ? rows : rows.filter((r) => r.active);
    return [...list].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const [ak, av] = sortKey(a.status);
      const [bk, bv] = sortKey(b.status);
      return ak !== bk ? ak - bk : av - bv;
    });
  }, [rows, showPaused]);

  const buyable = rows.filter(
    (r) => r.active && r.status.kind === "in_range",
  ).length;
  const paused = rows.filter((r) => !r.active).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
            {rows.length} card{rows.length === 1 ? "" : "s"} watched
            {buyable > 0 ? ` · ${buyable} inside your number` : ""}
          </p>
          <h1 className="chrome-text display mt-1 text-4xl sm:text-5xl">
            Watchlist
          </h1>
        </div>
        <button onClick={() => setModal("new")} className={btnPrimary}>
          + Watch a card
        </button>
      </div>

      <p className="mt-4 max-w-2xl text-sm text-dim">
        Your buy ceiling on the cards you are hunting, recalculated against
        today&rsquo;s market. This does not scan anyone&rsquo;s listings yet
        &mdash; that is the deal agent, and it is still being built. What it
        does is keep the number you can pay honest as the market moves.
      </p>

      {degraded ? (
        <p className="mt-4 rounded border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          The price service did not answer for some of these. Any prices below
          are the last ones cached and may be a few days old.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-8">
          <Empty title="Nothing on the hunt list.">
            <p>
              The cards you keep meaning to pick up cheap are the ones you
              forget the number on. Put one here with the most you will pay,
              and it stays current while the market moves.
            </p>
            <button
              onClick={() => setModal("new")}
              className={`${btnPrimary} mt-6`}
            >
              Watch your first card
            </button>
          </Empty>
        </div>
      ) : (
        <>
          {paused > 0 ? (
            <label className="mt-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-dim">
              <input
                type="checkbox"
                checked={showPaused}
                onChange={(e) => setShowPaused(e.target.checked)}
                className="accent-sticker"
              />
              Show {paused} paused
            </label>
          ) : null}

          <div className="table-scroll mt-6 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-line bg-card text-left font-mono text-[11px] uppercase tracking-wider text-dim">
                  <th className="px-4 py-2.5 font-bold">Card</th>
                  <th className="px-4 py-2.5 font-bold">Finish</th>
                  <th className="px-4 py-2.5 text-right font-bold">Market</th>
                  <th className="px-4 py-2.5 font-bold">{WINDOW_DAYS}-day trend</th>
                  <th className="px-4 py-2.5 text-right font-bold">Your target</th>
                  <th className="px-4 py-2.5 font-bold">Where it stands</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((r) => (
                  <Row
                    key={r.id}
                    row={r}
                    onDraft={() => setDraftRow(r)}
                    onEdit={() => setModal(r)}
                    onToggle={() =>
                      startTransition(() => {
                        setWatchActive(r.id, !r.active);
                      })
                    }
                    onDelete={() => {
                      if (confirm(`Stop watching "${r.card_name}"?`))
                        startTransition(() => {
                          deleteWatch(r.id);
                        });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-dim">
            Market is the TCGplayer market price for the finish you picked,
            refreshed daily by the provider &mdash; not a live quote. Pokémon
            singles only; sealed product is not in the price database.
          </p>

          <p className="mt-1.5 text-xs text-dim">
            The trend is built from prices we record once a day, per card and
            per finish. It starts the day after you add a card and only ever
            shows days actually recorded &mdash; nothing is estimated or filled
            in, so a short history reads as a short history. &ldquo;vs
            avg&rdquo; compares today against that average, which is the
            steadier number to judge a deal by: today&rsquo;s market is exactly
            what moves when a card is being dumped. <LastRunNote run={lastRun} />
          </p>
        </>
      )}

      {modal !== null && (
        <Modal
          title={modal === "new" ? "Watch a card" : "Edit watch"}
          onClose={() => setModal(null)}
        >
          <WatchForm
            watch={modal === "new" ? null : modal}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}

      {draftRow !== null && (
        <Modal title="Draft an offer" onClose={() => setDraftRow(null)}>
          <DraftMessage
            input={{
              cardName: draftRow.card_name,
              setName: draftRow.set_name,
              cardNumber: draftRow.card_number,
              finishLabel: draftRow.finish ?? draftRow.finishLabel,
              market: draftRow.market,
              average: draftRow.trend.average,
              recordedDays: draftRow.trend.days,
              ceiling: ceiling(draftRow, draftRow.market),
              show: nextShow,
            }}
            ceilingLabel={ceilingLabel(draftRow)}
          />
        </Modal>
      )}
    </div>
  );
}

/** Shows the panel's working, so the offer is never a number out of nowhere. */
function ceilingLabel(row: WatchRow): string {
  if (row.target_kind === "price")
    return `your fixed ceiling on this card is ${money(row.target_price)}`;
  const c = ceiling(row, row.market);
  return c === null
    ? `${row.target_pct}% under market, which has no dollar figure today`
    : `${row.target_pct}% under today's market of ${money(row.market)} is ${money(c)}`;
}

function Row({
  row,
  onDraft,
  onEdit,
  onToggle,
  onDelete,
}: {
  row: WatchRow;
  onDraft: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className={`transition hover:bg-chip/40 ${row.active ? "" : "opacity-55"}`}>
      <td className="max-w-[260px] px-4 py-2.5">
        <div className="flex items-center gap-3">
          {row.image_url ? (
            <Image
              src={row.image_url}
              alt=""
              width={32}
              height={44}
              unoptimized
              className="h-11 w-8 shrink-0 rounded-sm border border-line object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate">{row.card_name}</p>
            <p className="truncate text-xs text-dim">
              {row.set_name ?? "—"}
              {row.card_number ? ` · #${row.card_number}` : ""}
            </p>
            {row.notes ? (
              <p className="truncate text-xs text-dim">{row.notes}</p>
            ) : null}
          </div>
        </div>
      </td>

      <td className="px-4 py-2.5">
        {row.finish ?? (
          <span className="text-dim">
            Best
            {row.finishLabel ? (
              <span className="block text-xs">({row.finishLabel})</span>
            ) : null}
          </span>
        )}
      </td>

      <td className="num px-4 py-2.5 text-right">
        {row.market === null ? (
          <span className="text-dim">—</span>
        ) : (
          <>
            {money(row.market)}
            {row.stale ? (
              <span
                className="block text-xs text-loss"
                title="Live lookup failed — this is the last price we cached."
              >
                cached
              </span>
            ) : row.drift && row.drift.abs !== 0 ? (
              <span
                className={`block text-xs ${row.drift.abs < 0 ? "text-gain" : "text-dim"}`}
                title="Change since you added this watch"
              >
                {pct(row.drift.pct)} since added
              </span>
            ) : null}
          </>
        )}
      </td>

      <td className="px-4 py-2.5">
        <TrendCell row={row} />
      </td>

      <td className="px-4 py-2.5 text-right">
        <TargetCell row={row} />
      </td>

      <td className="px-4 py-2.5">
        <StatusCell row={row} />
      </td>

      <td className="whitespace-nowrap px-4 py-2.5 text-right">
        {row.tcgUrl ? (
          <a
            href={row.tcgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-ink"
          >
            Listings
          </a>
        ) : null}
        {/* Only offered when there is a price to build an offer around. A
            button that opens a panel saying "there is no number" is a button
            that teaches people not to press it. */}
        {row.active && row.market !== null ? (
          <button
            onClick={onDraft}
            className="ml-3 font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-ink"
            title="Write an offer message for this card. Copies to your clipboard — nothing is sent."
          >
            Draft
          </button>
        ) : null}
        <button
          onClick={onToggle}
          className="ml-3 font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-ink"
        >
          {row.active ? "Pause" : "Resume"}
        </button>
        <button
          onClick={onEdit}
          className="ml-3 font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-ink"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="ml-3 font-mono text-xs font-bold uppercase tracking-wider text-dim transition hover:text-loss"
        >
          Del
        </button>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ *
 * Add / edit
 * ------------------------------------------------------------------ */

/** What the form needs to know about a card. Same shape whether it came from
 *  a search (new watch) or a by-id lookup (editing an existing one). */
type Picked = {
  id: string;
  name: string;
  setName: string | null;
  number: string | null;
  rarity: string | null;
  image: string | null;
  finishes: { label: string; price: number | null }[];
};

const toPicked = (c: PriceCard): Picked => ({
  id: c.id,
  name: c.name,
  setName: c.setName,
  number: c.number,
  rarity: c.rarity,
  image: c.image,
  finishes: c.finishes.map((f) => ({ label: f.label, price: f.market ?? f.low })),
});

function WatchForm({
  watch,
  onDone,
}: {
  watch: WatchRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveWatch,
    {},
  );
  const [picked, setPicked] = useState<Picked | null>(null);
  const [finish, setFinish] = useState<string>(watch?.finish ?? "");
  const [kind, setKind] = useState<"price" | "percent">(
    watch?.target_kind ?? "percent",
  );
  const [pctVal, setPctVal] = useState(String(watch?.target_pct ?? 40));
  const [priceVal, setPriceVal] = useState(
    watch?.target_price === null || watch?.target_price === undefined
      ? ""
      : String(watch.target_price),
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  // "loading" only matters when editing: a new watch already has the card and
  // its price in hand from the search result.
  const [cardState, setCardState] = useState<"ready" | "loading" | "failed">(
    watch ? "loading" : "ready",
  );

  // Editing: pull the card so the finish dropdown offers what actually exists
  // today, rather than only the one finish stored on the row.
  useEffect(() => {
    if (!watch) return;
    let live = true;
    fetch(`/api/prices/card?id=${encodeURIComponent(watch.card_id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.ok) {
          setPicked(toPicked(j.card));
          setCardState("ready");
        } else {
          setCardState("failed");
        }
      })
      .catch(() => {
        if (live) setCardState("failed");
      });
    return () => {
      live = false;
    };
  }, [watch]);

  if (!watch && !picked)
    return <CardSearch onPick={(c) => setPicked(toPicked(c))} />;

  const card: Picked =
    picked ??
    // Editing while the card lookup is still in flight (or failed): fall back
    // to what the row already stores, so the form is never blank or stuck.
    ({
      id: watch!.card_id,
      name: watch!.card_name,
      setName: watch!.set_name,
      number: watch!.card_number,
      rarity: watch!.rarity,
      image: watch!.image_url,
      finishes: watch!.finish ? [{ label: watch!.finish, price: null }] : [],
    } as Picked);

  const chosen = finish === "" ? (card.finishes[0] ?? null) : card.finishes.find((f) => f.label === finish) ?? null;
  const marketNow = chosen?.price ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {watch ? <input type="hidden" name="id" value={watch.id} /> : null}
      <input type="hidden" name="card_id" value={card.id} />
      <input type="hidden" name="card_name" value={card.name} />
      <input type="hidden" name="set_name" value={card.setName ?? ""} />
      <input type="hidden" name="card_number" value={card.number ?? ""} />
      <input type="hidden" name="rarity" value={card.rarity ?? ""} />
      <input type="hidden" name="image_url" value={card.image ?? ""} />
      {/* Only stamped on creation — it is the "since you added it" baseline. */}
      {!watch ? (
        <input type="hidden" name="market_at_add" value={marketNow ?? ""} />
      ) : null}

      <div className="flex items-center gap-3 rounded border border-line bg-paper p-3">
        {card.image ? (
          <Image
            src={card.image}
            alt=""
            width={44}
            height={60}
            unoptimized
            className="h-15 w-11 shrink-0 rounded-sm border border-line object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-bold">{card.name}</p>
          <p className="truncate font-mono text-xs text-dim">
            {card.setName ?? "—"}
            {card.number ? ` · #${card.number}` : ""}
            {card.rarity ? ` · ${card.rarity}` : ""}
          </p>
        </div>
        {!watch ? (
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="ml-auto shrink-0 font-mono text-xs uppercase tracking-wider text-dim hover:text-ink"
          >
            Change
          </button>
        ) : null}
      </div>

      <Field label="Finish">
        <select
          name="finish"
          value={finish}
          onChange={(e) => setFinish(e.target.value)}
          className={fieldCls}
        >
          <option value="">
            Highest-value finish
            {card.finishes[0] ? ` — ${card.finishes[0].label} today` : ""}
          </option>
          {card.finishes.map((f) => (
            <option key={f.label} value={f.label}>
              {f.label}
              {f.price !== null ? ` — ${money(f.price)}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <p className="-mt-2 text-xs text-dim">
        Holo, reverse holo and normal are different money. Pin the one you are
        actually hunting, or leave it on the highest-value printing.
      </p>

      <Field label="Target">
        <div className="flex gap-2">
          <select
            name="target_kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "price" | "percent")}
            className={`${fieldCls} max-w-[11rem]`}
          >
            <option value="percent">% under market</option>
            <option value="price">Buy under $</option>
          </select>
          {kind === "percent" ? (
            <input
              key="pct"
              name="target_pct"
              type="number"
              min={0}
              max={95}
              step={1}
              required
              value={pctVal}
              onChange={(e) => setPctVal(e.target.value)}
              className={fieldCls}
            />
          ) : (
            <input
              key="price"
              name="target_price"
              type="number"
              min={0.01}
              step={0.01}
              required
              value={priceVal}
              onChange={(e) => setPriceVal(e.target.value)}
              placeholder="120.00"
              className={fieldCls}
            />
          )}
        </div>
      </Field>

      <Preview
        kind={kind}
        pct={Number(pctVal)}
        price={Number(priceVal)}
        market={marketNow}
        cardState={cardState}
      />

      <Field label="Notes">
        <input
          name="notes"
          maxLength={500}
          defaultValue={watch?.notes ?? ""}
          placeholder="Want a clean copy — centering matters on this one"
          className={fieldCls}
        />
      </Field>

      {watch ? (
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-dim">
          <input
            type="checkbox"
            name="active"
            defaultChecked={watch.active}
            className="accent-sticker"
          />
          Actively watching
        </label>
      ) : null}

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
          {pending ? "Saving…" : watch ? "Save changes" : "Watch it"}
        </button>
      </div>
    </form>
  );
}

/** Says, in dollars, what the target the user just typed actually means. */
function Preview({
  kind,
  pct: pctValue,
  price,
  market,
  cardState,
}: {
  kind: "price" | "percent";
  pct: number;
  price: number;
  market: number | null;
  cardState: "ready" | "loading" | "failed";
}) {
  // Whether the number is in range does not depend on knowing the market, so
  // say so first. Otherwise a card with no published price silently accepts a
  // target the database will reject.
  if (kind === "percent" && (!Number.isFinite(pctValue) || pctValue < 0 || pctValue > 95))
    return <p className="-mt-2 text-xs text-loss">Pick a percentage between 0 and 95.</p>;
  if (kind === "price" && Number.isFinite(price) && price < 0)
    return <p className="-mt-2 text-xs text-loss">A ceiling cannot be negative.</p>;

  if (cardState === "loading")
    return <p className="-mt-2 text-xs text-dim">Checking today&rsquo;s price…</p>;
  if (cardState === "failed")
    return (
      <p className="-mt-2 text-xs text-dim">
        Could not reach the price service, so there is no market figure to
        compare against right now. Your target still saves.
      </p>
    );

  if (market === null)
    return (
      <p className="-mt-2 text-xs text-dim">
        No published price for this finish yet, so there is nothing to measure
        a target against until the provider prices it.
      </p>
    );

  if (kind === "percent") {
    const ceil = Math.round(market * (1 - pctValue / 100) * 100) / 100;
    return (
      <p className="-mt-2 text-xs text-dim">
        Market is <span className="text-ink">{money(market)}</span> today, so{" "}
        {pctValue}% under means{" "}
        <span className="text-ink">pay up to {money(ceil)}</span>. That figure
        moves with the market.
      </p>
    );
  }

  if (!Number.isFinite(price) || price <= 0)
    return <p className="-mt-2 text-xs text-dim">Type the most you will pay.</p>;

  const diff = Math.round((market - price) * 100) / 100;
  return (
    <p className="-mt-2 text-xs text-dim">
      Market is <span className="text-ink">{money(market)}</span> today
      {diff > 0
        ? ` — ${money(diff)} above your ceiling.`
        : ` — already at or below your ceiling.`}
    </p>
  );
}

/** Step one of a new watch: find the exact card. A watch is pinned to a card
 *  id, not a typed name, because "Charizard" is forty different cards. */
function CardSearch({ onPick }: { onPick: (c: PriceCard) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PriceCard[] | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) {
      setError("Type at least two characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prices?q=${encodeURIComponent(term)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(
          json?.error === "busy"
            ? "Too many lookups at once — give it about 30 seconds."
            : "The price service did not answer. Try again in a moment.",
        );
        setResults(null);
        return;
      }
      setResults(json.cards as PriceCard[]);
    } catch {
      setError("Could not reach the price service.");
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={run} className="flex gap-2">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={60}
          placeholder="Umbreon VMAX"
          className={fieldCls}
        />
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "…" : "Find"}
        </button>
      </form>
      <p className="mt-2 text-xs text-dim">
        Search the printed card name, not the nickname. Pokémon singles only.
      </p>

      {error ? <p className="mt-4 text-sm text-loss">{error}</p> : null}

      {results !== null && results.length === 0 ? (
        <p className="mt-4 text-sm text-dim">Nothing matched that name.</p>
      ) : null}

      {results && results.length > 0 ? (
        <ul className="mt-4 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          {results.map((c) => {
            const top = c.finishes[0] ?? null;
            const price = top ? (top.market ?? top.low) : null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex w-full items-center gap-3 rounded border border-line bg-paper p-2 text-left transition hover:border-sticker"
                >
                  {c.image ? (
                    <Image
                      src={c.image}
                      alt=""
                      width={36}
                      height={50}
                      unoptimized
                      className="h-12 w-9 shrink-0 rounded-sm border border-line object-contain"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.name}</span>
                    <span className="block truncate font-mono text-xs text-dim">
                      {c.setName} · #{c.number}
                      {c.rarity ? ` · ${c.rarity}` : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 text-sm">
                    {price === null ? (
                      <span className="text-dim">no price</span>
                    ) : (
                      money(price)
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-4 text-xs text-dim">
        Just want to price one card without saving it?{" "}
        <Link href="/tools/price-checker" className="underline">
          Use the price checker
        </Link>
        .
      </p>
    </div>
  );
}
