/**
 * price-history-snapshot — records the market price of every watched card once
 * a day, per finish.
 *
 * WHY IT LIVES HERE AND NOT IN A VERCEL CRON ROUTE. The obvious home is
 * app/api/cron/... behind vercel.json, but the Vercel project is stuck behind
 * a pending env-var change and a branch merge. This runs entirely inside
 * Supabase — pg_cron calls this function — so price history starts
 * accumulating without waiting on any of that. History is the one thing that
 * cannot be backfilled later: a day not recorded is gone.
 *
 * AUTH. verify_jwt is off, because pg_cron has no user session to present.
 * Callers must send x-cron-secret, checked against a value in Supabase Vault
 * by public.verify_cron_secret(). Two further things make a leaked secret
 * cheap: the job refuses to run twice in one local day, and it caps its own
 * upstream calls — hard, when no API key is configured.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const ENDPOINT = "https://api.pokemontcg.io/v2/cards";

/** Upstream rejects very long `id:a OR id:b ...` queries; 20 is verified safe. */
const ID_BATCH = 20;

/**
 * Retry policy, copied from lib/prices.ts deliberately rather than shared —
 * that file is Next.js server code and cannot be imported into Deno. If you
 * change one, change both. The measured reason for five attempts: this API
 * returned 5xx on ~42% of identical, valid calls on 2026-07-28, and 400 on
 * requests that succeeded unchanged seconds later. 401/403 are never retried;
 * those mean the key is wrong and waiting does not fix it.
 */
const ATTEMPTS = 5;
const BACKOFF_MS = 300;

/**
 * Upstream call budget for one run.
 *
 * Keyless, api.pokemontcg.io allows 1,000 requests/day, and that ceiling is
 * shared with the public price checker, the watchlist and Show mode's
 * save-to-device — all of which call out from our servers, not the visitor's.
 * So this job gets a small, hard allowance it cannot exceed no matter how far
 * the watchlist grows. Setting POKEMONTCG_API_KEY (free, from dev.pokemontcg.io)
 * raises the account ceiling to 20,000/day and lifts this cap with it.
 *
 * A run that hits the cap records what it managed and reports 'partial'. It
 * does not pretend the day is complete.
 */
const KEYLESS_MAX_BATCHES = 10;
const KEYED_MAX_BATCHES = 400;

/**
 * Finish labels. These MUST stay identical to FINISH_LABELS in lib/prices.ts:
 * a watch stores the label it was created with, and history rows are read back
 * by that same label. A label that drifts here silently produces a card whose
 * trend line is always empty.
 */
const FINISH_LABELS: Record<string, string> = {
  normal: "Normal",
  holofoil: "Holofoil",
  reverseHolofoil: "Reverse holo",
  unlimited: "Unlimited",
  unlimitedHolofoil: "Unlimited holo",
  "1stEdition": "1st edition",
  "1stEditionNormal": "1st edition",
  "1stEditionHolofoil": "1st edition holo",
};

/**
 * The day a price belongs to, in Pacific time.
 *
 * Not UTC: UTC midnight is 5pm here, which would cut a vendor's day in half
 * and file an evening price under tomorrow. The business is in SoCal and the
 * schedule runs in the small hours local, so the local calendar date is the
 * one that matches what a person means by "yesterday's price".
 */
function pacificDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1_000_000 ? v : null;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Ids from this provider look like "sv3pt5-6" / "swsh12pt5-160". */
const ID_RE = /^[a-z0-9]+(pt[0-9]+)?-[a-z0-9]+$/i;
const isCardId = (v: string) => v.length > 0 && v.length <= 64 && ID_RE.test(v);

type HistoryRow = {
  card_id: string;
  finish: string;
  day: string;
  market: number | null;
  low: number | null;
  high: number | null;
  priced_at: string | null;
};

/** One upstream GET with the retry policy above. */
async function requestUpstream(
  params: URLSearchParams,
  apiKey: string | undefined,
): Promise<{ ok: true; json: unknown } | { ok: false }> {
  const url = `${ENDPOINT}?${params.toString()}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { ok: true, json: await res.json() };
      // Auth failures are permanent; everything else on this API is transient.
      if (res.status === 401 || res.status === 403) return { ok: false };
    } catch {
      // network error / timeout — fall through to the next attempt
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, BACKOFF_MS));
  }
  return { ok: false };
}

/**
 * Turn one upstream card into history rows — one per finish that has a price.
 *
 * A finish with neither a market nor a low price is dropped, matching both the
 * DB check constraint and lib/prices.ts. Recording it as a zero would drag
 * every average computed off this table toward a number no card ever sold at.
 */
// deno-lint-ignore-file no-explicit-any
function rowsForCard(raw: any, day: string): HistoryRow[] {
  if (!raw?.id) return [];
  const prices = raw.tcgplayer?.prices ?? {};
  const pricedAt = raw.tcgplayer?.updatedAt ? String(raw.tcgplayer.updatedAt) : null;

  return Object.entries(prices)
    .map(([key, p]: [string, any]) => ({
      card_id: String(raw.id),
      finish: FINISH_LABELS[key] ?? key,
      day,
      market: num(p?.market),
      low: num(p?.low),
      high: num(p?.high),
      priced_at: pricedAt,
    }))
    .filter((r) => r.finish.length <= 40 && (r.market !== null || r.low !== null));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  const started = new Date();
  const day = pacificDay(started);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- auth ---------------------------------------------------------------
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!secret) return json({ error: "unauthorized" }, 401);

  const { data: valid, error: authError } = await supabase.rpc("verify_cron_secret", {
    p_candidate: secret,
  });
  if (authError) {
    console.error("verify_cron_secret failed", authError.message);
    return json({ error: "auth_check_failed" }, 500);
  }
  if (valid !== true) return json({ error: "unauthorized" }, 401);

  // A manual re-run, for when you want today's numbers refreshed on purpose.
  const force = new URL(req.url).searchParams.get("force") === "1";

  // --- one run per day ----------------------------------------------------
  // Deliberately returns before writing anything, including a run row: this is
  // also what stops a leaked secret from being usable to burn upstream quota,
  // and what makes a cron that fires twice harmless.
  if (!force) {
    const { data: already } = await supabase
      .from("price_history_runs")
      .select("id, finished_at, status")
      .in("status", ["ok", "partial"])
      // Matched on the recorded Pacific day, not on a timestamp window. A
      // window would need the UTC offset, which changes twice a year, and
      // would silently let a second run through on the days it changed.
      .eq("day", day)
      .limit(1);

    if (already && already.length > 0) {
      return json({ status: "skipped_already_ran", day, run: already[0] });
    }
  }

  // --- what to look up ----------------------------------------------------
  const { data: watched, error: watchError } = await supabase.rpc("watched_card_ids");
  if (watchError) {
    console.error("watched_card_ids failed", watchError.message);
    return json({ error: "watchlist_read_failed" }, 500);
  }

  const ids = ((watched ?? []) as { card_id: string }[])
    .map((r) => r.card_id)
    .filter(isCardId);

  const apiKey = Deno.env.get("POKEMONTCG_API_KEY") ?? undefined;
  const keyed = Boolean(apiKey);

  // Nothing watched yet is a perfectly good outcome, not a failure. Record it
  // so the run log shows the schedule is alive rather than showing nothing.
  if (ids.length === 0) {
    await supabase.from("price_history_runs").insert({
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      day,
      status: "ok",
      keyed,
      detail: "No active watchlist rows — nothing to record.",
    });
    return json({ status: "ok", day, cards: 0, rows: 0 });
  }

  // --- record the attempt before making it --------------------------------
  const { data: run, error: runError } = await supabase
    .from("price_history_runs")
    .insert({
      started_at: started.toISOString(),
      day,
      status: "running",
      cards_requested: ids.length,
      keyed,
    })
    .select("id")
    .single();

  if (runError || !run) {
    console.error("could not open run row", runError?.message);
    return json({ error: "run_log_failed" }, 500);
  }

  // --- fetch --------------------------------------------------------------
  const allBatches = chunk(ids, ID_BATCH);
  const cap = keyed ? KEYED_MAX_BATCHES : KEYLESS_MAX_BATCHES;
  const batches = allBatches.slice(0, cap);
  const capped = allBatches.length > batches.length;

  const rows: HistoryRow[] = [];
  const resolved = new Set<string>();
  let batchesFailed = 0;

  for (const batch of batches) {
    const raw = await requestUpstream(
      new URLSearchParams({
        q: batch.map((id) => `id:${id}`).join(" OR "),
        pageSize: String(batch.length),
        select: "id,tcgplayer",
      }),
      apiKey,
    );

    if (!raw.ok) {
      batchesFailed += 1;
      continue;
    }

    for (const card of (((raw.json as any)?.data ?? []) as any[])) {
      const cardRows = rowsForCard(card, day);
      if (cardRows.length > 0) resolved.add(String(card.id));
      rows.push(...cardRows);
    }
  }

  // --- write --------------------------------------------------------------
  // upsert, not insert: a forced re-run should refresh the day it already
  // wrote rather than error, and the primary key guarantees it can only ever
  // be one row per card, per finish, per day.
  let written = 0;
  let writeError: string | null = null;

  for (const slice of chunk(rows, 500)) {
    const { error } = await supabase
      .from("price_history")
      .upsert(slice, { onConflict: "card_id,finish,day" });
    if (error) {
      writeError = error.message;
      break;
    }
    written += slice.length;
  }

  // --- close the run honestly ---------------------------------------------
  // 'ok' is reserved for a run that asked for everything it meant to and got
  // it. Anything less says so, because the whole point of this table is that
  // a gap in the chart has an explanation sitting next to it.
  const notes: string[] = [];
  if (capped) {
    notes.push(
      `Capped at ${cap} upstream ${cap === 1 ? "call" : "calls"} of ` +
        `${allBatches.length} needed${keyed ? "" : " — no POKEMONTCG_API_KEY set"}. ` +
        `${(allBatches.length - batches.length) * ID_BATCH} cards were not checked today.`,
    );
  }
  if (batchesFailed > 0) {
    notes.push(`${batchesFailed} of ${batches.length} upstream batches failed after ${ATTEMPTS} attempts.`);
  }
  if (writeError) notes.push(`Write stopped: ${writeError}`);
  if (!keyed) {
    notes.push(
      "Running without POKEMONTCG_API_KEY: the free key from dev.pokemontcg.io " +
        "raises the shared daily ceiling from 1,000 to 20,000 and lifts this job's cap.",
    );
  }

  const status = writeError
    ? written > 0
      ? "partial"
      : "failed"
    : capped || batchesFailed > 0
      ? "partial"
      : "ok";

  await supabase
    .from("price_history_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      cards_resolved: resolved.size,
      rows_written: written,
      batches: batches.length,
      batches_failed: batchesFailed,
      detail: notes.length > 0 ? notes.join(" ").slice(0, 2000) : null,
    })
    .eq("id", run.id);

  return json({
    status,
    day,
    keyed,
    cards_requested: ids.length,
    cards_resolved: resolved.size,
    rows_written: written,
    batches: batches.length,
    batches_failed: batchesFailed,
    detail: notes.length > 0 ? notes.join(" ") : null,
  });
});
