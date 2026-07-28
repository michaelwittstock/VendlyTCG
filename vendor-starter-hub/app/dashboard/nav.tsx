"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Overview", glyph: "◈" },
  { href: "/dashboard/inventory", label: "Inventory", glyph: "▤" },
  { href: "/dashboard/watchlist", label: "Watchlist", glyph: "◎" },
  { href: "/dashboard/sales", label: "Sales", glyph: "＄" },
  { href: "/dashboard/customers", label: "Customers", glyph: "◉" },
  { href: "/dashboard/shows", label: "Shows", glyph: "▚" },
];

export default function DashNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:px-0 md:pb-0">
      {items.map((it) => {
        const active =
          it.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex shrink-0 items-center gap-2.5 rounded px-3 py-2 font-mono text-xs uppercase tracking-wider transition ${
              active
                ? "bg-chip text-ink"
                : "text-dim hover:bg-chip/60 hover:text-ink"
            }`}
          >
            <span aria-hidden className={active ? "text-sticker" : "text-dim/70"}>
              {it.glyph}
            </span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
