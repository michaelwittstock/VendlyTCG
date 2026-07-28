import Link from "next/link";
import { site } from "./site";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-sticker font-mono text-sm font-bold text-onaccent">
            V
          </span>
          <span className="display text-lg tracking-wide">{site.name}</span>
        </Link>
        <nav className="hidden items-center gap-5 font-mono text-xs uppercase tracking-wider md:flex">
          {site.nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-dim transition hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-wider text-dim transition hover:text-ink"
          >
            Vendor login
          </Link>
          <Link
            href="/#waitlist"
            className="rounded bg-ink px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-onaccent transition hover:bg-sticker hover:text-onaccent"
          >
            Join the list
          </Link>
        </div>
      </div>
    </header>
  );
}
