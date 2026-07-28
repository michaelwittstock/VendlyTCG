import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth-actions";
import DashNav from "./nav";

export const metadata = { title: "Back office" };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const name = profile?.display_name || user.email?.split("@")[0] || "Vendor";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 md:flex-row md:gap-10 md:px-6 md:py-10">
      <aside className="md:w-52 md:shrink-0">
        <div className="mb-3 flex items-baseline justify-between gap-3 md:mb-5 md:block">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-dim">
              <span className="text-sticker">▮</span> Back office
            </p>
            <p className="display mt-1 truncate text-xl">{name}</p>
          </div>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-wider text-dim hover:text-ink md:hidden"
          >
            ← Site
          </Link>
        </div>
        <DashNav />
        <div className="mt-6 hidden border-t border-line pt-4 md:block">
          <p className="truncate font-mono text-[11px] text-dim">{user.email}</p>
          <div className="mt-3 flex flex-col items-start gap-2">
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-wider text-dim transition hover:text-ink"
            >
              ← Back to site
            </Link>
            <form action={signOut}>
              <button className="font-mono text-[11px] uppercase tracking-wider text-dim transition hover:text-loss">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
