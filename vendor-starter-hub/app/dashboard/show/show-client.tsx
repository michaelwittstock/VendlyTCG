"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  clearPack,
  describeAge,
  isStale,
  loadLog,
  loadPack,
  loadQueue,
  logTotals,
  matchItem,
  mergeSyncResults,
  newRef,
  nextAttemptDelayMs,
  packAge,
  payUpTo,
  pruneLog,
  queueSummary,
  saleTotals,
  savePack,
  saveLog,
  saveQueue,
  sortItems,
  syncBatch,
  type Channel,
  type LogEntry,
  type PackItem,
  type QueuedSale,
  type ShowPack,
  type SyncResult,
} from "@/lib/showpack";
import { money, Sticker, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/dashboard/ui";

type Tab = "sell" | "buy" | "queue";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const todayISO = () => new Date().toISOString();

/* Big enough to hit one-handed while someone is standing in front of you.
 * 56px is the low end of what survives a cold hand and a phone at arm's
 * length; the whole point of this page is that it is not the normal UI. */
const TAP = "min-h-[56px]";

export default function ShowClient({ userId }: { userId: string }) {
  const [pack, setPack] = useState<ShowPack | null>(null);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [saved, setSaved] = useState<"unknown" | "yes" | "no">("unknown");
  const [installer, setInstaller] = useState<InstallPrompt | null>(null);
  const [tab, setTab] = useState<Tab>("sell");
  const [showId, setShowId] = useState<string>("");
  const [now, setNow] = useState(() => Date.now());
  /* Consecutive whole-request failures — the request died, so no individual
   * sale got an answer and none of their own attempt counts moved. Without
   * this, a dead connection would retry every two seconds all day. */
  const [syncFails, setSyncFails] = useState(0);

  // The queue is read inside callbacks that outlive the render they were made
  // in. A ref keeps them looking at the real thing rather than a stale copy —
  // a sync that merges into a stale array loses sales.
  const queueRef = useRef<QueuedSale[]>([]);
  const persistQueue = useCallback((next: QueuedSale[]) => {
    queueRef.current = next;
    setQueue(next);
    if (!saveQueue(next)) {
      setWarn(
        "This browser refused to save to the device. Sales are only held in memory — do not close this tab until they sync.",
      );
    }
  }, []);

  const pushLog = useCallback((entry: LogEntry) => {
    setLog((prev) => {
      const next = pruneLog([entry, ...prev]);
      saveLog(next);
      return next;
    });
  }, []);

  /* ---------------- sync ---------------- */

  const syncNow = useCallback(async (): Promise<void> => {
    const q = queueRef.current;
    if (q.length === 0) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sales/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales: syncBatch(q, 100) }),
        cache: "no-store",
      });

      if (res.status === 401) {
        setSyncFails((n) => n + 1);
        setNote(
          "Your session expired while you were offline. Sign in again to sync — nothing is lost, the sales are still on this device.",
        );
        return;
      }
      if (!res.ok) {
        setSyncFails((n) => n + 1);
        setNote("The server did not accept the sync. Your sales are still queued.");
        return;
      }

      setSyncFails(0);
      const json = (await res.json()) as { ok?: boolean; results?: SyncResult[] };
      const results = Array.isArray(json.results) ? json.results : [];
      const merged = mergeSyncResults(queueRef.current, results);
      persistQueue(merged.queue);

      const parts: string[] = [];
      if (merged.synced > 0)
        parts.push(`${merged.synced} sale${merged.synced === 1 ? "" : "s"} synced.`);
      if (merged.oversold.length > 0)
        parts.push(
          `Stock was lower than what you sold for ${merged.oversold.join(", ")} — the sale is recorded, your count was wrong. Check inventory.`,
        );
      if (merged.failed.length > 0)
        parts.push(`${merged.failed.length} could not be saved — see the queue.`);
      setNote(parts.length ? parts.join(" ") : null);
    } catch {
      // Offline, or the request died mid-flight. Either way the queue is
      // untouched, which is the whole point of it existing.
      setSyncFails((n) => n + 1);
      setNote("No connection — sales stay queued on this device.");
    } finally {
      setSyncing(false);
    }
  }, [persistQueue]);

  const refreshPack = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/show-pack", { cache: "no-store" });
      if (res.status === 401) {
        setNote("Signed out. Sign in again to refresh prices and stock.");
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as { ok?: boolean; pack?: ShowPack };
      if (!json.pack) return;
      setPack(json.pack);
      const ok = savePack(json.pack);
      setSaved(ok ? "yes" : "no");
      if (!ok)
        setWarn(
          "Your inventory is loaded but could not be saved to this device, so it will not survive going offline. Free some space or leave private browsing.",
        );
      if (json.pack.pricesDegraded)
        setNote("Some card prices could not be refreshed just now — those rows show their last known price.");
    } catch {
      // Expected offline. The stored pack is already on screen.
    } finally {
      setRefreshing(false);
    }
  }, []);

  /* ---------------- boot ---------------- */

  useEffect(() => {
    setOnline(navigator.onLine);
    const stored = loadPack(userId);
    if (stored) {
      setPack(stored);
      setSaved("yes");
    }
    queueRef.current = loadQueue();
    setQueue(queueRef.current);
    setLog(pruneLog(loadLog()));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        setWarn(
          "This browser blocked the offline worker, so the page itself will not open without signal. Sales you log will still be saved to the device.",
        );
      });
    } else {
      setWarn(
        "This browser has no service worker support, so the page will not open without signal. Everything else still works.",
      );
    }

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstaller(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);

    // Drives the "cached 3 hr ago" label without a render loop.
    const tick = setInterval(() => setNow(Date.now()), 30_000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeinstallprompt", onInstall);
      clearInterval(tick);
    };
  }, [userId]);

  // Refresh and drain on arrival, and again every time signal comes back.
  useEffect(() => {
    if (!online) return;
    void refreshPack();
    void syncNow();
  }, [online, refreshPack, syncNow]);

  /* Keep trying while there is anything queued, backing off as failures pile
   * up: 2s, 4s, 8s … capped at a minute. Fast at first so a venue's wifi
   * flickering back is caught almost immediately; capped so a genuinely dead
   * connection is not hammered for the length of a show. */
  const retryDelay = useMemo(() => {
    if (queue.length === 0) return null;
    const worstRow = queue.reduce((m, s) => Math.max(m, s.attempts), 0);
    return nextAttemptDelayMs(Math.max(worstRow, syncFails));
  }, [queue, syncFails]);

  useEffect(() => {
    if (!online || retryDelay === null) return;
    const t = setTimeout(() => void syncNow(), retryDelay);
    return () => clearTimeout(t);
  }, [online, retryDelay, syncing, syncNow]);

  /* ---------------- logging a sale ---------------- */

  /**
   * One path, online or off: write to the device first, then try to send.
   *
   * Going straight to the server when there happens to be signal would mean
   * the risky path (queue, retry, dedupe) is the one that almost never runs
   * and therefore the one that is never really tested. This way the queue is
   * exercised on every single sale, and a request that dies halfway cannot
   * lose anything.
   */
  const addSale = useCallback(
    (sale: Omit<QueuedSale, "ref" | "createdAt" | "attempts" | "lastError">) => {
      const entry: QueuedSale = {
        ...sale,
        ref: newRef(),
        createdAt: todayISO(),
        attempts: 0,
        lastError: null,
      };
      persistQueue([...queueRef.current, entry]);
      const totals = saleTotals(entry);
      pushLog({
        ref: entry.ref,
        at: entry.soldAt,
        itemName: entry.itemName,
        quantity: entry.quantity,
        gross: totals.gross,
        profit: totals.profit,
      });
      if (navigator.onLine) void syncNow();
    },
    [persistQueue, pushLog, syncNow],
  );

  const removeQueued = useCallback(
    (ref: string) => {
      persistQueue(queueRef.current.filter((s) => s.ref !== ref));
    },
    [persistQueue],
  );

  /* ---------------- derived ---------------- */

  const age = pack ? packAge(pack, now) : null;
  const stale = pack ? isStale(age) : true;
  const qs = useMemo(() => queueSummary(queue), [queue]);
  const day = useMemo(() => logTotals(log), [log]);
  const items = useMemo(() => (pack ? sortItems(pack.items) : []), [pack]);

  /* ---------------- render ---------------- */

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
            Works with no signal
          </p>
          <h1 className="chrome-text display mt-1 text-4xl sm:text-5xl">Show mode</h1>
        </div>
        <div className="flex items-center gap-2">
          <Sticker tone={online ? "gain" : "loss"}>{online ? "Online" : "Offline"}</Sticker>
          {qs.count > 0 && (
            <Sticker tone="accent">
              {qs.count} queued{syncing ? " · syncing" : ""}
            </Sticker>
          )}
        </div>
      </div>

      {/* Age of what is on screen. The single most important sentence on the
          page: a stale price you know is stale is useful, one you think is
          live is dangerous. */}
      <p className="mt-3 text-sm text-dim">
        {pack ? (
          <>
            Inventory and prices on this device were taken{" "}
            <span className={stale ? "font-bold text-loss" : "text-ink"}>{describeAge(age)}</span>.
            {stale && " Refresh before you rely on them."}
          </>
        ) : (
          "Nothing saved to this device yet. Open this page once with signal and it will keep working without one."
        )}
      </p>

      {(note || warn) && (
        <div className="mt-4 space-y-2">
          {warn && (
            <p className="rounded border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-ink">
              {warn}
            </p>
          )}
          {note && (
            <p className="rounded border border-line bg-card px-4 py-3 text-sm text-dim">
              {note}{" "}
              <button onClick={() => setNote(null)} className="underline hover:text-ink">
                dismiss
              </button>
            </p>
          )}
        </div>
      )}

      {/* ---- before you leave the house ---- */}
      <div className="mt-6 rounded-lg border border-line bg-card p-4">
        <p className={labelCls}>Before you leave the house</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void refreshPack()}
            disabled={!online || refreshing}
            className={btnPrimary}
          >
            {refreshing ? "Saving…" : "Save to this device"}
          </button>
          {installer && (
            <button
              onClick={async () => {
                await installer.prompt();
                await installer.userChoice;
                setInstaller(null);
              }}
              className={btnGhost}
            >
              Install as an app
            </button>
          )}
          <span className="font-mono text-[11px] uppercase tracking-wider text-dim">
            {saved === "yes"
              ? "✓ Saved on this device"
              : saved === "no"
                ? "✗ Could not save"
                : "Not saved yet"}
          </span>
        </div>
        <p className="mt-3 text-xs text-dim">
          Saving copies your inventory, your buy ceilings and the page itself onto this
          phone. Do it on wifi before the show — at the venue there may be nothing to
          download from.
        </p>
      </div>

      {/* ---- the day so far ---- */}
      {day.sales > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sales" value={String(day.sales)} />
          <Stat label="Items" value={String(day.units)} />
          <Stat label="Taken" value={money(day.gross)} />
          <Stat
            label="Profit"
            value={money(day.profit)}
            tone={day.profit >= 0 ? "gain" : "loss"}
          />
        </div>
      )}

      {/* ---- which show ---- */}
      {pack && pack.shows.length > 0 && (
        <label className="mt-4 flex flex-col gap-1.5">
          <span className={labelCls}>Which show are you at?</span>
          <select
            value={showId}
            onChange={(e) => setShowId(e.target.value)}
            className={`${fieldCls} ${TAP} text-base`}
          >
            <option value="">Not tagged to a show</option>
            {pack.shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* ---- tabs ---- */}
      <div className="mt-6 flex gap-1 border-b border-line">
        {(
          [
            ["sell", `Sell${pack ? ` · ${items.length}` : ""}`],
            ["buy", `Buy${pack ? ` · ${pack.watches.length}` : ""}`],
            ["queue", `Queue${qs.count ? ` · ${qs.count}` : ""}`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider transition ${
              tab === key
                ? "border-sticker text-ink"
                : "border-transparent text-dim hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "sell" && (
          <SellTab
            pack={pack}
            showId={showId}
            onSale={addSale}
            tap={TAP}
          />
        )}
        {tab === "buy" && <BuyTab pack={pack} age={age} stale={stale} />}
        {tab === "queue" && (
          <QueueTab
            queue={queue}
            log={log}
            online={online}
            syncing={syncing}
            onSync={() => void syncNow()}
            onRemove={removeQueued}
          />
        )}
      </div>

      <div className="mt-10 border-t border-line pt-5 text-xs text-dim">
        <p className="font-bold uppercase tracking-wider">What this does not do yet</p>
        <p className="mt-2">
          <strong>No barcode or card scanning.</strong> Barcodes only exist on sealed
          product, which is exactly what the card price data does not cover, and reading a
          raw card from a photo is image recognition — a different project, not a feature
          of this one. Typing two letters into the search box filters your stock in about
          the same time a scan would take, so this is not the bottleneck it looks like.
        </p>
        <p className="mt-2">
          <strong>Buy prices are a snapshot, not a live quote.</strong> They are whatever
          was true when you last saved to this device, and every figure says so.
        </p>
        <p className="mt-2">
          Everything here lives on this phone until it syncs.{" "}
          <Link href="/dashboard/sales" className="underline hover:text-ink">
            Sales
          </Link>{" "}
          and{" "}
          <Link href="/dashboard/inventory" className="underline hover:text-ink">
            Inventory
          </Link>{" "}
          are the real record once it has.
        </p>
        {pack && qs.count === 0 && (
          <button
            onClick={() => {
              clearPack();
              setPack(null);
              setSaved("unknown");
            }}
            className="mt-3 underline hover:text-loss"
          >
            Clear the copy on this device
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3">
      <p className={labelCls}>{label}</p>
      <p
        className={`num mt-1 text-2xl ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/* ================================================================== *
 * Sell
 * ================================================================== */

type NewSale = Omit<QueuedSale, "ref" | "createdAt" | "attempts" | "lastError">;

function SellTab({
  pack,
  showId,
  onSale,
  tap,
}: {
  pack: ShowPack | null;
  showId: string;
  onSale: (s: NewSale) => void;
  tap: string;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PackItem | null>(null);
  const [quick, setQuick] = useState(false);

  const items = useMemo(() => (pack ? sortItems(pack.items) : []), [pack]);
  const shown = useMemo(() => items.filter((i) => matchItem(i, q)), [items, q]);

  if (!pack) {
    return (
      <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
        Save your inventory to this device first — the button is above.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type two letters of the name…"
          // Search, not a keyword box: a phone should not autocapitalise or
          // autocorrect a card name into something else mid-transaction.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${fieldCls} ${tap} flex-1 text-base`}
        />
        <button onClick={() => setQuick(true)} className={`${btnGhost} ${tap} shrink-0`}>
          Quick sale
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
          No inventory saved. Add items in{" "}
          <Link href="/dashboard/inventory" className="underline hover:text-ink">
            Inventory
          </Link>
          , then save to this device again. You can still log a quick sale.
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-center text-sm text-dim">
          Nothing matches “{q}”. Use{" "}
          <button onClick={() => setQuick(true)} className="underline hover:text-ink">
            quick sale
          </button>{" "}
          for anything not in your stock list.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {shown.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => setPicked(i)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-chip/50 ${tap}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-ink">{i.name}</span>
                  <span className="block truncate font-mono text-[11px] uppercase tracking-wider text-dim">
                    {[i.set_name, i.condition].filter(Boolean).join(" · ") || i.category}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-base">
                    {i.asking_price === null ? "—" : money(i.asking_price)}
                  </span>
                  <span
                    className={`block font-mono text-[11px] uppercase tracking-wider ${
                      i.quantity > 0 ? "text-dim" : "text-loss"
                    }`}
                  >
                    {i.quantity > 0 ? `${i.quantity} left` : "0 left"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(picked || quick) && (
        <SaleSheet
          item={picked}
          shows={pack.shows}
          customers={pack.customers}
          showId={showId}
          tap={tap}
          onClose={() => {
            setPicked(null);
            setQuick(false);
          }}
          onSave={(s) => {
            onSale(s);
            setPicked(null);
            setQuick(false);
            setQ("");
          }}
        />
      )}
    </div>
  );
}

function SaleSheet({
  item,
  shows,
  customers,
  showId,
  tap,
  onClose,
  onSave,
}: {
  item: PackItem | null;
  shows: ShowPack["shows"];
  customers: ShowPack["customers"];
  showId: string;
  tap: string;
  onClose: () => void;
  onSave: (s: NewSale) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(
    item?.asking_price !== null && item?.asking_price !== undefined
      ? String(item.asking_price)
      : "",
  );
  const [cost, setCost] = useState("");
  const [fees, setFees] = useState("");
  const [channel, setChannel] = useState<Channel>("show");
  const [customerId, setCustomerId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const n = (v: string) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : 0;
  };

  // Item sales take their cost basis from the server at sync time, so the
  // preview here uses the copy on the device. Quick sales use what you type.
  const unitCost = item ? item.cost_basis : n(cost);
  const preview = saleTotals({
    quantity: qty,
    salePrice: n(price),
    costBasis: unitCost,
    fees: n(fees),
  });

  const submit = () => {
    const finalName = item ? item.name : name.trim();
    if (!finalName) {
      setErr("What did you sell?");
      return;
    }
    if (!Number.isFinite(parseFloat(price))) {
      setErr("Put in what they paid.");
      return;
    }
    onSave({
      soldAt: todayISO(),
      itemId: item?.id ?? null,
      itemName: finalName,
      category: item?.category ?? "other",
      quantity: qty,
      salePrice: n(price),
      costBasis: item ? item.cost_basis : n(cost),
      fees: n(fees),
      channel,
      showId: showId || null,
      customerId: customerId || null,
      notes: null,
    });
  };

  return (
    <Sheet title={item ? item.name : "Quick sale"} onClose={onClose}>
      {item && item.quantity < qty && (
        <p className="mb-4 rounded border border-loss/40 bg-loss/10 px-3 py-2 text-sm">
          Your count says {item.quantity} left. Logging {qty} anyway is fine — the sale is
          real and the count gets corrected — but check the shelf.
        </p>
      )}

      {!item && (
        <label className="mb-4 flex flex-col gap-1.5">
          <span className={labelCls}>What sold</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Charizard ex 199/165"
            className={`${fieldCls} ${tap} text-base`}
            autoFocus
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>How many</span>
          <div className="flex items-stretch gap-2">
            <button
              onClick={() => setQty((v) => Math.max(1, v - 1))}
              aria-label="One fewer"
              className={`${btnGhost} ${tap} w-14 text-xl`}
            >
              −
            </button>
            <span
              className={`num flex ${tap} flex-1 items-center justify-center rounded border border-line text-2xl`}
            >
              {qty}
            </span>
            <button
              onClick={() => setQty((v) => Math.min(9999, v + 1))}
              aria-label="One more"
              className={`${btnGhost} ${tap} w-14 text-xl`}
            >
              +
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Price each</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            // decimal, not numeric: a phone keypad without a dot cannot type $12.50
            inputMode="decimal"
            placeholder="0.00"
            className={`${fieldCls} ${tap} num text-2xl`}
            autoFocus={Boolean(item)}
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {!item && (
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Cost each</span>
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${fieldCls} ${tap} num text-base`}
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Fees</span>
          <input
            value={fees}
            onChange={(e) => setFees(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={`${fieldCls} ${tap} num text-base`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Paid with</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className={`${fieldCls} ${tap} text-base`}
          >
            <option value="show">At the table</option>
            <option value="local">Local / meetup</option>
            <option value="online">Online</option>
          </select>
        </label>
      </div>

      {customers.length > 0 && (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className={labelCls}>Regular? (optional)</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className={`${fieldCls} ${tap} text-base`}
          >
            <option value="">Nobody in particular</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="mt-4 flex items-baseline justify-between font-mono text-xs uppercase tracking-wider text-dim">
        <span>
          Taking <span className="num text-base text-ink">{money(preview.gross)}</span>
        </span>
        <span>
          Profit{" "}
          <span
            className={`num text-base ${preview.profit >= 0 ? "text-gain" : "text-loss"}`}
          >
            {money(preview.profit)}
          </span>
        </span>
      </p>

      {err && <p className="mt-3 text-sm text-loss">{err}</p>}

      <button onClick={submit} className={`${btnPrimary} ${tap} mt-4 w-full text-base`}>
        Log it
      </button>
      <p className="mt-2 text-center text-xs text-dim">
        Saved to this phone straight away, whether or not there is signal.
      </p>
    </Sheet>
  );
}

/** A bottom sheet, not a centre modal. One-handed means the controls belong
 *  where a thumb already is. */
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/70 sm:items-start sm:pt-[6vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-card px-5 py-4">
          <h2 className="display truncate pr-3 text-xl">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 px-2 font-mono text-lg text-dim transition hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Buy — what you can pay, from prices cached before you left
 * ================================================================== */

function BuyTab({
  pack,
  age,
  stale,
}: {
  pack: ShowPack | null;
  age: number | null;
  stale: boolean;
}) {
  const [q, setQ] = useState("");

  if (!pack) {
    return (
      <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
        Save to this device first and your buy ceilings come with it.
      </p>
    );
  }

  if (pack.watches.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
        Nothing on your watchlist. Add the cards you are hunting in{" "}
        <Link href="/dashboard/watchlist" className="underline hover:text-ink">
          Watchlist
        </Link>{" "}
        and their buy ceilings will be here at the next show.
      </p>
    );
  }

  const rows = pack.watches.filter((w) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return `${w.card_name} ${w.set_name ?? ""}`.toLowerCase().includes(t);
  });

  return (
    <div>
      <p
        className={`rounded border px-4 py-3 text-sm ${
          stale ? "border-loss/40 bg-loss/10 text-ink" : "border-line bg-card text-dim"
        }`}
      >
        These are the prices as they stood {describeAge(age)}, not right now.
        {stale
          ? " That is old enough to be wrong. Treat every figure below as a starting point, not a quote."
          : " Card prices move about once a day, so they are close — but say “let me check” rather than quoting them as live."}
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a card…"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${fieldCls} ${TAP} mt-4 text-base`}
      />

      <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
        {rows.map((w) => {
          const ceiling = payUpTo(w);
          return (
            <li key={`${w.card_id}-${w.finish_label ?? "any"}`} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-ink">{w.card_name}</p>
                  <p className="truncate font-mono text-[11px] uppercase tracking-wider text-dim">
                    {[w.set_name, w.finish_label ?? "best finish"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {ceiling === null ? (
                    <>
                      <p className="num text-base text-dim">—</p>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                        {/* Never a $0 ceiling. No price means no answer. */}
                        No cached price
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="num text-xl text-gain">{money(ceiling)}</p>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                        pay up to
                      </p>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-dim">
                {w.market === null ? "Market unknown" : `Market ${money(w.market)}`}
                {" · "}
                {w.target_kind === "percent"
                  ? `${w.target_pct ?? 0}% under`
                  : "fixed ceiling"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ================================================================== *
 * Queue — what has not reached the server, and what today came to
 * ================================================================== */

function QueueTab({
  queue,
  log,
  online,
  syncing,
  onSync,
  onRemove,
}: {
  queue: QueuedSale[];
  log: LogEntry[];
  online: boolean;
  syncing: boolean;
  onSync: () => void;
  onRemove: (ref: string) => void;
}) {
  const totals = logTotals(log);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          {queue.length === 0
            ? "Everything you have logged has reached the server."
            : `${queue.length} sale${queue.length === 1 ? "" : "s"} waiting on this device.`}
        </p>
        <button
          onClick={onSync}
          disabled={!online || syncing || queue.length === 0}
          className={btnGhost}
        >
          {syncing ? "Syncing…" : online ? "Sync now" : "Offline"}
        </button>
      </div>

      {queue.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {queue.map((s) => {
            const t = saleTotals(s);
            return (
              <li key={s.ref} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-ink">
                      {s.quantity > 1 && (
                        <span className="num text-dim">{s.quantity}× </span>
                      )}
                      {s.itemName}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                      {new Date(s.soldAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {s.attempts > 0 && ` · ${s.attempts} attempt${s.attempts === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <p className="num shrink-0 text-base">{money(t.gross)}</p>
                </div>
                {s.lastError && (
                  <div className="mt-2 rounded border border-loss/40 bg-loss/10 px-3 py-2 text-sm">
                    <p className="text-ink">{s.lastError}</p>
                    <p className="mt-1 text-xs text-dim">
                      This sale is still on the device. It will keep retrying. If it can
                      never work — the item was deleted, say — remove it here and log it
                      again from{" "}
                      <Link href="/dashboard/sales" className="underline hover:text-ink">
                        Sales
                      </Link>
                      .
                    </p>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Remove "${s.itemName}" from the queue? It has NOT been saved to your records, and this cannot be undone.`,
                          )
                        )
                          onRemove(s.ref);
                      }}
                      className="mt-2 font-mono text-[11px] uppercase tracking-wider text-loss underline"
                    >
                      Remove without saving
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8">
        <p className={labelCls}>Logged on this device in the last day and a half</p>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-dim">Nothing yet.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sales" value={String(totals.sales)} />
              <Stat label="Items" value={String(totals.units)} />
              <Stat label="Taken" value={money(totals.gross)} />
              <Stat
                label="Profit"
                value={money(totals.profit)}
                tone={totals.profit >= 0 ? "gain" : "loss"}
              />
            </div>
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {log.map((e) => (
                <li key={e.ref} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {e.quantity > 1 && <span className="num text-dim">{e.quantity}× </span>}
                    {e.itemName}
                  </span>
                  <span className="num shrink-0 text-sm">{money(e.gross)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-dim">
              This list is the device's own note of the day, kept so the numbers are
              there when you pack up. Your{" "}
              <Link href="/dashboard/sales" className="underline hover:text-ink">
                Sales
              </Link>{" "}
              page is the real record.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
