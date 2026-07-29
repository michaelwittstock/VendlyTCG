/**
 * alert-digest — once a day, tell each vendor which of the cards they are
 * hunting has fallen against its own recent history. One push per person.
 *
 * COSTS NOTHING UPSTREAM. It runs after price-history-snapshot, so today's
 * price is already a row in price_history. Asking the price API again would
 * spend shared quota to learn something we wrote an hour earlier.
 *
 * WHAT IT WILL NOT SAY. Nothing here has seen a listing, a seller or an
 * auction — that needs the eBay Browse API and is a separate, still-blocked
 * roadmap row. The copy in alerts.ts is written to be true without it.
 *
 * AUTH: same shared secret as the snapshot job.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendPush } from "./webpush.ts";
import { shouldRaise, ceilingFor, digest, type Candidate } from "./alerts.ts";

/** Public half of the VAPID pair. Not a secret; see lib/push.ts. */
const VAPID_PUBLIC_KEY =
  "BPsJQYo222HgefVv_MqNqR5iz57F2rfzmlME1dty-P7a356hbY9LIsUqrvpPBw0XE6iSOonx14D9Ffj0j1P3Z_E";

/** VAPID requires a contact the push service can reach. Not shown to users. */
const VAPID_SUBJECT = "mailto:contact@michaelwittstock.com";

/** Same Pacific-day rule as the snapshot job, for the same reasons. */
function pacificDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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
  if (authError) return json({ error: "auth_check_failed" }, 500);
  if (valid !== true) return json({ error: "unauthorized" }, 401);

  const force = new URL(req.url).searchParams.get("force") === "1";

  // --- one digest per day -------------------------------------------------
  // Returns before writing anything, so a cron that fires twice cannot send
  // two notifications, and a leaked secret cannot be used to spam anybody.
  if (!force) {
    const { data: already } = await supabase
      .from("alert_runs")
      .select("id, status, finished_at")
      .in("status", ["ok", "partial"])
      .eq("day", day)
      .limit(1);
    if (already && already.length > 0) {
      return json({ status: "skipped_already_ran", day, run: already[0] });
    }
  }

  const { data: run, error: runError } = await supabase
    .from("alert_runs")
    .insert({ started_at: started.toISOString(), day, status: "running" })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "run_log_failed" }, 500);

  const notes: string[] = [];
  const close = async (status: string, counts: Record<string, number>) => {
    await supabase
      .from("alert_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        detail: notes.length > 0 ? notes.join(" ").slice(0, 2000) : null,
        ...counts,
      })
      .eq("id", run.id);
    return json({ status, day, ...counts, detail: notes.join(" ") || null });
  };

  // --- who qualifies ------------------------------------------------------
  const { data: rawCandidates, error: candErr } = await supabase.rpc("alert_candidates", {
    p_day: day,
  });
  if (candErr) {
    notes.push(`Candidate query failed: ${candErr.message}`);
    return await close("failed", {});
  }

  type Row = Candidate & { user_id: string };
  const candidates = (rawCandidates ?? []) as Row[];

  // The cooldown lives in alerts.ts rather than in SQL so it can be tested
  // without a database. It is also the rule most likely to need tuning once
  // real people are receiving these.
  const raising = candidates.filter((c) => shouldRaise(c, day).raise);

  if (raising.length === 0) {
    // Deliberately silent. A daily "no deals today" is how you teach someone
    // to swipe the notification away without reading it.
    notes.push(
      candidates.length > 0
        ? `${candidates.length} met the threshold but all were inside their cooldown.`
        : "Nothing met the threshold today.",
    );
    return await close("ok", { candidates: candidates.length });
  }

  // --- record the alerts --------------------------------------------------
  // Written before anything is sent. If the send fails, the alert still
  // happened and is visible in the app; notified_at is what separates
  // "we raised it" from "their phone got it".
  const { data: inserted, error: insErr } = await supabase
    .from("alerts")
    .upsert(
      raising.map((c) => ({
        user_id: c.user_id,
        watch_id: c.watch_id,
        card_id: c.card_id,
        card_name: c.card_name,
        finish: c.finish,
        day,
        market: c.market,
        average: c.average,
        pct_under: c.pct_under,
        recorded_days: c.recorded_days,
        ceiling: ceilingFor(c),
      })),
      { onConflict: "watch_id,day", ignoreDuplicates: false },
    )
    .select("id, user_id");

  if (insErr) {
    notes.push(`Could not record alerts: ${insErr.message}`);
    return await close("failed", { candidates: candidates.length });
  }

  const alertIdsByUser = new Map<string, string[]>();
  for (const a of inserted ?? []) {
    const list = alertIdsByUser.get(a.user_id);
    if (list) list.push(a.id);
    else alertIdsByUser.set(a.user_id, [a.id]);
  }

  // --- send ---------------------------------------------------------------
  const { data: jwkText } = await supabase.rpc("get_vapid_private_jwk");
  if (!jwkText) {
    // The alerts are already recorded and visible in the app, so this is a
    // partial success, not a failure.
    notes.push("No VAPID key configured — alerts were recorded but nothing could be sent.");
    return await close("partial", {
      candidates: candidates.length,
      alerts_raised: raising.length,
    });
  }
  const privateJwk = JSON.parse(jwkText as string) as JsonWebKey;

  const byUser = new Map<string, Row[]>();
  for (const c of raising) {
    const list = byUser.get(c.user_id);
    if (list) list.push(c);
    else byUser.set(c.user_id, [c]);
  }

  let sent = 0;
  let failed = 0;
  let retired = 0;
  let notified = 0;
  const deliveredUsers: string[] = [];

  for (const [userId, cards] of byUser) {
    const payload = digest(cards);
    if (!payload) continue;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failure_count")
      .eq("user_id", userId);

    if (!subs || subs.length === 0) continue;

    let anyDelivered = false;
    for (const sub of subs) {
      const result = await sendPush(
        sub,
        JSON.stringify(payload),
        privateJwk,
        VAPID_PUBLIC_KEY,
        VAPID_SUBJECT,
      );

      if (result.ok) {
        sent += 1;
        anyDelivered = true;
        await supabase
          .from("push_subscriptions")
          .update({ last_sent_at: new Date().toISOString(), failure_count: 0, last_error: null })
          .eq("id", sub.id);
        continue;
      }

      failed += 1;
      if (result.gone) {
        // Uninstalled app or revoked permission. Deleting beats retrying this
        // every night forever and calling the run 'partial' each time.
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        retired += 1;
      } else {
        // A soft failure: rate limiting, a push service outage, a network
        // blip. Counted rather than retired, because these do come back.
        await supabase
          .from("push_subscriptions")
          .update({
            failure_count: (sub.failure_count ?? 0) + 1,
            last_error: `${result.status} ${result.detail}`.slice(0, 300),
          })
          .eq("id", sub.id);
      }
    }

    if (anyDelivered) {
      notified += 1;
      deliveredUsers.push(userId);
    }
  }

  // --- close it out -------------------------------------------------------
  // notified_at is stamped only for people whose device actually took the
  // message. An alert with no notified_at is one the app can still show while
  // being honest that the phone never got it.
  if (deliveredUsers.length > 0) {
    const ids = deliveredUsers.flatMap((u) => alertIdsByUser.get(u) ?? []);
    if (ids.length > 0) {
      await supabase
        .from("alerts")
        .update({ notified_at: new Date().toISOString() })
        .in("id", ids);
    }
  }

  // Alerts raised for someone with no subscribed device is a normal state, not
  // an error — they get them in the app. Worth recording so a silent night can
  // be explained without guessing.
  const unreachable = byUser.size - notified;
  if (unreachable > 0) {
    notes.push(
      `${unreachable} ${unreachable === 1 ? "person has" : "people have"} alerts but no device took the push.`,
    );
  }
  if (retired > 0) notes.push(`${retired} dead subscription(s) retired.`);
  if (failed > 0) notes.push(`${failed} send(s) failed.`);

  return await close(failed > 0 ? "partial" : "ok", {
    candidates: candidates.length,
    alerts_raised: raising.length,
    people_notified: notified,
    pushes_sent: sent,
    pushes_failed: failed,
    subscriptions_retired: retired,
  });
});
