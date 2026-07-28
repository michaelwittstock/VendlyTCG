"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signUp, type AuthState } from "@/app/auth-actions";

const fieldCls =
  "w-full rounded border border-line bg-paper px-3.5 py-2.5 text-ink placeholder:text-dim/70 focus:border-sticker focus:outline-none";
const labelCls =
  "font-mono text-[11px] font-bold uppercase tracking-wider text-dim";

export default function AuthForm({
  mode,
  next,
  serverError,
}: {
  mode: "login" | "signup";
  next?: string;
  serverError?: string;
}) {
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {}
  );
  const error = state.error ?? serverError;

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {mode === "signup" && (
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Display name</span>
          <input
            name="display_name"
            placeholder="Table 12 Cards"
            autoComplete="name"
            className={fieldCls}
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Email</span>
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          autoComplete="email"
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          placeholder={mode === "signup" ? "8+ characters" : "••••••••"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={fieldCls}
        />
      </label>

      {error && (
        <p className="rounded border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}
      {state.message && (
        <p className="rounded border border-gain/40 bg-gain/10 px-3 py-2 text-sm text-gain">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded bg-sticker px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
      >
        {pending
          ? "Working…"
          : mode === "login"
            ? "Sign in"
            : "Create account"}
      </button>

      <p className="mt-2 text-center text-sm text-dim">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="text-ink underline underline-offset-4 hover:text-sticker">
              Set up your table
            </Link>
          </>
        ) : (
          <>
            Already vending?{" "}
            <Link href="/login" className="text-ink underline underline-offset-4 hover:text-sticker">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
