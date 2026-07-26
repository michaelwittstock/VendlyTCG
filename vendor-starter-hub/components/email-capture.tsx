"use client";

import { useState } from "react";

export default function EmailCapture({ cta = "Join the list" }: { cta?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="font-mono text-sm font-bold text-sticker">
        You are on the list. Watch your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="w-full rounded border border-line bg-card px-4 py-3 text-ink placeholder:text-dim"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="whitespace-nowrap rounded bg-sticker px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5 disabled:opacity-60"
      >
        {status === "sending" ? "Sending..." : cta}
      </button>
      {status === "error" && (
        <p className="font-mono text-xs text-sticker sm:self-center">
          That email did not go through — check it and retry.
        </p>
      )}
    </form>
  );
}
