import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gear we use",
  description: "Recommended vendor gear for card shows: sleeves, toploaders, display cases, stands, and table tech.",
};

const categories = [
  { name: "Sleeves + toploaders", note: "Protection that doesn't eat your margin." },
  { name: "Display cases", note: "For the hits — visible and locked." },
  { name: "Stands + risers", note: "Get cards off the flat table and into eyelines." },
  { name: "Table tech", note: "Card readers, lighting, battery packs." },
];

export default function Gear() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="chrome-text display text-5xl sm:text-6xl">Gear we use</h1>
      <p className="mt-5 text-lg text-dim">
        Specific recommendations with links are coming. When a link earns us a commission, it will
        be clearly marked — and nothing gets listed that we wouldn't run at our own table.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {categories.map((c) => (
          <div key={c.name} className="rounded-lg border border-line bg-card p-6">
            <span className="sticker-muted">Coming</span>
            <h2 className="display mt-4 text-2xl">{c.name}</h2>
            <p className="mt-2 text-sm text-dim">{c.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
