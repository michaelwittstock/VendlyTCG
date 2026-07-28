import Link from "next/link";
import AuthForm from "@/components/dashboard/auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-sticker font-mono text-sm font-bold text-onaccent">
            V
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-dim">
            Vendly TCG · Back office
          </span>
        </Link>
        <h1 className="chrome-text display mt-6 text-5xl">Sign in</h1>
        <p className="mt-3 text-dim">
          Your inventory, sales, and show numbers — right where you left them.
        </p>
        <AuthForm mode="login" next={sp.next} serverError={sp.error} />
      </div>
    </div>
  );
}
