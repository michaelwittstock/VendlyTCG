"use client";

import { useEffect, useState, useTransition } from "react";
import {
  savePushSubscription,
  removePushSubscription,
  saveAlertSettings,
  type ActionState,
} from "@/app/dashboard/actions";
import { pushSupport, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { fieldCls, btnPrimary, btnGhost, Sticker } from "@/components/dashboard/ui";
import { useActionState } from "react";

export type AlertSettings = {
  enabled: boolean;
  min_pct_under: number;
  min_recorded_days: number;
  quiet_until: string | null;
};

export default function AlertsPanel({
  settings,
  subscribed,
  recentCount,
}: {
  settings: AlertSettings;
  /** Whether THIS account has any device subscribed, per the database. */
  subscribed: boolean;
  recentCount: number;
}) {
  // Support is a browser fact, so it can only be known after mount. Rendering
  // the button optimistically and hiding it a tick later reads as a glitch;
  // an explicit "checking" state does not.
  const [support, setSupport] = useState<ReturnType<typeof pushSupport> | null>(null);
  const [thisDevice, setThisDevice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAlertSettings,
    {},
  );

  useEffect(() => {
    setSupport(pushSupport());
    (async () => {
      if (!("serviceWorker" in navigator)) return setThisDevice(false);
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setThisDevice(Boolean(sub));
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    const result = await subscribeToPush();
    if (!result.ok) {
      setError(
        result.reason === "denied"
          ? "Your browser is blocking notifications for this site. You will have to turn them back on in browser settings — it will not ask again."
          : result.reason === "needs_install"
            ? "Add this to your Home Screen first."
            : "This browser would not give us a subscription.",
      );
      setBusy(false);
      return;
    }
    const saved = await savePushSubscription(result.sub);
    setBusy(false);
    if (saved.error) return setError(saved.error);
    setThisDevice(true);
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    const endpoint = await unsubscribeFromPush();
    if (endpoint) await removePushSubscription(endpoint);
    setThisDevice(false);
    setBusy(false);
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-dim">
            Alerts
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-dim">
            Once a day, if a card you are watching has fallen against{" "}
            <span className="text-ink">its own recent average</span>, we send one
            notification listing them. It compares market prices we have recorded
            &mdash; it does not see anyone&rsquo;s listings, so it can tell you a
            card got cheaper, not that a specific one is for sale.
          </p>
        </div>
        {subscribed ? (
          <Sticker tone="gain">On</Sticker>
        ) : (
          <Sticker tone="dim">Off</Sticker>
        )}
      </div>

      {recentCount > 0 ? (
        <p className="mt-3 text-xs text-dim">
          {recentCount} {recentCount === 1 ? "alert" : "alerts"} in the last 30 days.
        </p>
      ) : null}

      {/* ---- this device ---- */}
      <div className="mt-4 border-t border-line pt-4">
        {support === null ? (
          <p className="text-xs text-dim">Checking this device&hellip;</p>
        ) : !support.ok && support.reason === "needs_install" ? (
          <p className="text-xs text-dim">
            iPhone and iPad only allow notifications from an installed app. Tap{" "}
            <span className="text-ink">Share</span> then{" "}
            <span className="text-ink">Add to Home Screen</span>, open it from
            there, and this button will appear.
          </p>
        ) : !support.ok ? (
          <p className="text-xs text-dim">
            This browser does not support push notifications. Your alerts are
            still recorded and shown here.
          </p>
        ) : thisDevice ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-dim">
              This device is subscribed.
            </span>
            <button type="button" onClick={turnOff} disabled={busy} className={btnGhost}>
              {busy ? "Working…" : "Turn off on this device"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={turnOn} disabled={busy} className={btnPrimary}>
              {busy ? "Working…" : "Turn on alerts"}
            </button>
            <span className="text-xs text-dim">
              Your browser will ask for permission. It only asks once, so we do
              not ask until you press this.
            </span>
          </div>
        )}
        {error ? <p className="mt-2 text-xs text-loss">{error}</p> : null}
      </div>

      {/* ---- thresholds ---- */}
      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-4 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.enabled}
            className="accent-sticker"
          />
          Send me alerts
        </label>

        <label className="text-xs text-dim">
          <span className="mb-1 block">At least this far under its average</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              name="min_pct_under"
              min={5}
              max={90}
              step={1}
              defaultValue={settings.min_pct_under}
              className={`${fieldCls} w-20`}
            />
            <span className="text-ink">%</span>
          </span>
        </label>

        <label className="text-xs text-dim">
          {/* The honest reason this exists, in the label rather than a tooltip:
              people set thresholds they do not understand and then distrust
              the alerts. */}
          <span className="mb-1 block">After this many recorded days</span>
          <input
            type="number"
            name="min_recorded_days"
            min={3}
            max={30}
            step={1}
            defaultValue={settings.min_recorded_days}
            className={`${fieldCls} w-20`}
          />
        </label>

        <label className="text-xs text-dim">
          <span className="mb-1 block">Quiet until (optional)</span>
          <input
            type="date"
            name="quiet_until"
            defaultValue={settings.quiet_until ?? ""}
            className={`${fieldCls} w-40`}
          />
        </label>

        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>

        {state.error ? (
          <p className="w-full text-xs text-loss">{state.error}</p>
        ) : state.ok ? (
          <p className="w-full text-xs text-gain">Saved.</p>
        ) : null}
      </form>

      <p className="mt-3 text-xs text-dim">
        A card that stays cheap will not be repeated every day &mdash; once it has
        alerted, it stays quiet for a week unless it drops materially further. If
        nothing qualifies, nothing is sent.
      </p>
    </section>
  );
}
