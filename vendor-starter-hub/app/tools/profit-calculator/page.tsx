import type { Metadata } from "next";
import Calculator from "./calculator";

export const metadata: Metadata = {
  title: "Show profit calculator",
  description: "Estimate real profit for a card show table: fees, costs, cost of goods, and your break-even sales number.",
};

export default function ProfitCalculator() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <span className="sticker">Free tool</span>
      <h1 className="chrome-text display mt-5 text-5xl sm:text-6xl">Show profit calculator</h1>
      <p className="mt-5 max-w-xl text-lg text-dim">
        Punch in the table fee, your costs, and what you expect to sell. See your real profit and
        the gross you need just to break even.
      </p>
      <div className="mt-10">
        <Calculator />
      </div>
    </div>
  );
}
