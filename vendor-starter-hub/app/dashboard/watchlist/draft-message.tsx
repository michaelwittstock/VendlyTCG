"use client";

/**
 * The "Draft message" panel on a watchlist row.
 *
 * IT COPIES. IT DOES NOT SEND. There is no send button, no recipient field
 * and no network call in this file — the only way the text leaves is the
 * user's own clipboard, into their own app, under their own name. If a future
 * change adds a send path, it stops being a drafting tool and becomes a bot
 * messaging strangers about money on someone else's behalf, which is how
 * accounts get banned and reputations get dented at a show where everyone
 * knows everyone.
 *
 * The textarea is editable on purpose. The draft is a starting point, not a
 * script, and the person sending it knows things the database does not.
 */

import { useMemo, useRef, useState } from "react";
import {
  draftOffer,
  blockedReason,
  MIN_DAYS_TO_CITE,
  type Channel,
  type DraftInput,
} from "@/lib/negotiate";
import { money, btnPrimary, btnGhost } from "@/components/dashboard/ui";

export type NextShow = { name: string; date: string | null } | null;

const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: "in_person", label: "At a table", hint: "Cash, in hand, today." },
  { key: "online", label: "Online", hint: "A DM or a message through a marketplace." },
];

export default function DraftMessage({
  input,
  ceilingLabel,
}: {
  input: Omit<DraftInput, "channel">;
  /** How the ceiling was arrived at, so the panel can show its working. */
  ceilingLabel: string;
}) {
  const [channel, setChannel] = useState<Channel>("in_person");
  const [copied, setCopied] = useState<"idle" | "done" | "manual">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);

  const draft = useMemo(() => draftOffer({ ...input, channel }), [input, channel]);

  // Editing is per-channel: switching tone should give you the new draft, not
  // silently keep the old text you were halfway through changing.
  const [edited, setEdited] = useState<Record<Channel, string | null>>({
    in_person: null,
    online: null,
  });
  const text = edited[channel] ?? (draft.ok ? draft.text : "");

  async function copy() {
    const el = ref.current;
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.value);
      setCopied("done");
    } catch {
      // Insecure context, or permission denied. Select it so the person can
      // finish the job with a keystroke instead of being told "failed".
      el.focus();
      el.select();
      setCopied("manual");
    }
  }

  if (!draft.ok)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-dim">{blockedReason(draft.reason)}</p>
        <p className="text-xs text-dim">
          Set a fixed &ldquo;buy under $&rdquo; ceiling on this watch and the
          draft has something to work from.
        </p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setChannel(c.key);
              setCopied("idle");
            }}
            className={
              c.key === channel
                ? `${btnPrimary} flex-1`
                : `${btnGhost} flex-1`
            }
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-dim">
        {CHANNELS.find((c) => c.key === channel)!.hint}
      </p>

      <textarea
        ref={ref}
        rows={6}
        value={text}
        onChange={(e) => {
          setEdited((p) => ({ ...p, [channel]: e.target.value }));
          setCopied("idle");
        }}
        className="w-full rounded border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink focus:border-sticker focus:outline-none"
      />

      <div className="rounded border border-line bg-paper px-3 py-2 text-xs text-dim">
        <p>
          Offering <span className="num text-ink">{money(draft.offer)}</span>{" "}
          &mdash; {ceilingLabel}
          {draft.headroom <= 0 ? (
            <>, which is that number exactly.</>
          ) : draft.boundBy === "ceiling" ? (
            <>
              , so you have{" "}
              <span className="num text-ink">{money(draft.headroom)}</span> of
              room left before you hit your own number.
            </>
          ) : (
            <>
              . This one is capped by today&rsquo;s market rather than your
              ceiling, so the{" "}
              <span className="num text-ink">{money(draft.headroom)}</span> of
              room is room up to market &mdash; not up to your number, which is
              higher and would be overpaying.
            </>
          )}
        </p>
        <p className="mt-1.5">
          {draft.cited
            ? "The draft cites this card's own recorded average, which is a figure you can defend if you are asked where it came from."
            : `No history is cited: that needs at least ${MIN_DAYS_TO_CITE} recorded days and a market that is actually below the average today. Quoting an average you are currently above argues the other side's case.`}
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        {copied === "done" ? (
          <span className="font-mono text-[11px] uppercase tracking-wider text-gain">
            Copied
          </span>
        ) : null}
        {copied === "manual" ? (
          <span className="font-mono text-[11px] uppercase tracking-wider text-dim">
            Selected &mdash; press ⌘C
          </span>
        ) : null}
        <button type="button" onClick={copy} className={btnPrimary}>
          Copy message
        </button>
      </div>

      <p className="text-xs text-dim">
        Nothing is sent from here. This only ever reaches your clipboard
        &mdash; you send it yourself, in your own app, and you can change any
        word of it first.
      </p>
    </div>
  );
}
