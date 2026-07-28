"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "done" | "already" | "invalid" | "offline";

const MESSAGES: Record<"invalid" | "offline", string> = {
  invalid: "That address does not look right — check it and retry.",
  offline: "Signups are down right now, so that did not save. Try again shortly.",
};

export default function EmailCapture({
  cta = "Join the list",
  source = "unknown",
}: {
  cta?: string;
  source?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        setStatus(data.already ? "already" : "done");
      } else if (data.error === "invalid_email") {
        setStatus("invalid");
      } else {
        // not_configured / store_failed / anything unexpected: the address was
        // NOT stored, so never show the success message here.
        setStatus("offline");
      }
    } catch {
      setStatus("offline");
    }
  }

  if (status === "done" || status === "already") {
    return (
      <p className="font-mono text-sm font-bold text-sticker">
        {status === "already"
          ? "You are already on the list — nothing more to do."
          : "You are on the list. Nothing hits your inbox until there is something worth sending."}
      </p>
    );
  }

  const errorMessage =
    status === "invalid" || status === "offline" ? MESSAGES[status] : null;

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        aria-invalid={status === "invalid" || undefined}
        className="w-full rounded border border-line bg-card px-4 py-3 text-ink placeholder:text-dim"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="whitespace-nowrap rounded bg-sticker px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5 disabled:opacity-60"
      >
        {status === "sending" ? "Sending..." : cta}
      </button>
      {errorMessage && (
        <p role="status" className="font-mono text-xs text-sticker sm:self-center">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
