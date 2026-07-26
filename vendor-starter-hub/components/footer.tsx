import Link from "next/link";
import { site } from "./site";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-3">
        <div>
          <p className="display text-xl">{site.name}</p>
          <p className="mt-2 text-sm text-dim">{site.tagline}</p>
          <p className="mt-4 font-mono text-xs uppercase tracking-wider text-dim">
            Built table-side in the Inland Empire, CA
          </p>
        </div>
        <nav className="flex flex-col gap-2 font-mono text-xs uppercase tracking-wider">
          {site.nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-dim transition hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="text-sm text-dim">
          <p>
            Some links on this site may become affiliate links. When they do, they will be clearly
            marked.
          </p>
          <p className="mt-4 font-mono text-xs">
            © {new Date().getFullYear()} {site.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
