import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/email-capture";

const TITLE = "Your first vendor table";
const DESCRIPTION =
  "The complete guide to running your first trading card show table: break-even math, inventory mix, sourcing, pricing to comps, booth layout, payments, California seller's permits and sales tax, and the numbers to check afterward.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "card show vendor guide",
    "first card show table",
    "trading card vendor",
    "how to sell at a card show",
    "California seller's permit card show",
    "SoCal card shows",
  ],
  openGraph: {
    title: `${TITLE} — Vendly TCG`,
    description: DESCRIPTION,
    type: "article",
  },
};

const UPDATED = "July 28, 2026";

const toc = [
  { id: "break-even", label: "1. Start with break-even" },
  { id: "pick-a-show", label: "2. Pick the right first show" },
  { id: "inventory", label: "3. What to actually stock" },
  { id: "sourcing", label: "4. Sourcing without overpaying" },
  { id: "pricing", label: "5. Pricing to comps" },
  { id: "booth", label: "6. Booth setup that sells" },
  { id: "payments", label: "7. Cash, cards, and the float" },
  { id: "show-day", label: "8. Show day, hour by hour" },
  { id: "legal", label: "9. Permits and sales tax (CA)" },
  { id: "records", label: "10. What to log" },
  { id: "after", label: "11. The four numbers after" },
  { id: "faq", label: "12. FAQ" },
];

const faqs = [
  {
    q: "Do I need a business license to sell at a card show?",
    a: "A seller's permit and a business license are two different things. The seller's permit is a state registration with the CDTFA and is free. A business license is issued by the city or county you operate in, and whether you need one for occasional show selling depends on that city. Check the city where the venue sits, not where you live.",
  },
  {
    q: "How much inventory should I bring to my first show?",
    a: "Enough to fill your table roughly twice. You want to be able to restock the front edge mid-day without the table looking picked over, but not so much that you're storing crates behind you and never opening them.",
  },
  {
    q: "Should I take trades?",
    a: "Only if you can confidently price both sides in under a minute. Trades are where new vendors lose the most money, because it is easy to overvalue what you are receiving when you are excited about it. If you are not sure, offer cash instead.",
  },
  {
    q: "What if I barely sell anything?",
    a: "That is a normal first show, and it is still cheap tuition. Write down what people picked up and put back down, what they asked for that you did not have, and what the vendor next to you was moving. That list is worth more than the day's sales.",
  },
  {
    q: "Is a locking display case worth it?",
    a: "Not on day one. A case only pays for itself once you are carrying cards worth protecting, and it takes up space you could be using for the $5–40 singles that actually generate first-table revenue. Add it when your inventory justifies it, not before.",
  },
  {
    q: "Card show prices or online prices — which should I use?",
    a: "Neither exactly. Price so the buyer beats what they would pay online after shipping, and so you beat what you would net online after fees and shipping. The room between those two numbers is the entire reason the table exists.",
  },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="display mt-14 scroll-mt-24 text-3xl sm:text-4xl">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed text-dim">{children}</p>;
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 leading-relaxed text-dim">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sticker" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-card p-5">
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-sticker">{label}</p>
      <div className="mt-2 text-sm leading-relaxed text-dim">{children}</div>
    </div>
  );
}

export default function FirstVendorTable() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: TITLE,
        description: DESCRIPTION,
        datePublished: "2026-07-28",
        dateModified: "2026-07-28",
        author: { "@type": "Organization", name: "Vendly TCG" },
        publisher: { "@type": "Organization", name: "Vendly TCG" },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl px-6 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="font-mono text-xs uppercase tracking-wider text-dim">
        <Link href="/guides" className="transition hover:text-ink">
          Guides
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink">First vendor table</span>
      </nav>

      <span className="sticker mt-6 inline-block">The pillar guide</span>
      <h1 className="chrome-text display mt-5 text-5xl sm:text-6xl">Your first vendor table</h1>
      <p className="mt-5 text-lg leading-relaxed text-dim">
        Booking a table is the easy part. This is everything between paying the vendor fee and
        driving home with more money than you left with — the math, the inventory, the pricing,
        the paperwork, and the parts nobody warns you about.
      </p>
      <p className="mt-4 font-mono text-xs uppercase tracking-wider text-dim">
        Updated {UPDATED} · ~12 min read · Written for SoCal vendors
      </p>

      <nav
        aria-label="On this page"
        className="mt-10 rounded-lg border border-line bg-card p-6"
      >
        <p className="font-mono text-xs font-bold uppercase tracking-wider">On this page</p>
        <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {toc.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="text-sm text-dim transition hover:text-sticker">
                {t.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <H2 id="break-even">1. Start with break-even</H2>
      <P>
        Before you fall in love with a show, do the arithmetic that decides whether it is worth
        attending. Your table costs what it costs whether you sell one card or four hundred, so
        the only question that matters on the front end is how much you have to gross to get back
        to zero.
      </P>
      <P>
        Add up everything the day costs you before any card changes hands: the table fee, gas and
        parking, food, and anything you pay a helper. That is your fixed cost. Then divide it by
        the gross margin you realistically expect over what you paid for your inventory.
      </P>
      <Callout label="Worked example">
        A $75 table, $25 in gas and parking, and $20 in food is $120 fixed. If you sell at a 40%
        margin over cost basis, you need <span className="num">$300</span> in sales to break even.
        At a thinner 25% margin, that same day needs <span className="num">$480</span>. The table
        fee did not change — your margin did.
      </Callout>
      <P>
        Run your own numbers in the{" "}
        <Link href="/tools/profit-calculator" className="text-sticker underline underline-offset-4">
          profit calculator
        </Link>{" "}
        before you commit. If break-even is more than you have ever sold in a single day, either
        find a cheaper table or bring inventory with more room in it.
      </P>

      <H2 id="pick-a-show">2. Pick the right first show</H2>
      <P>
        Your first table should be cheap and close. A $40–75 table thirty minutes away teaches you
        the same lessons as a $250 table two hours away, and the tuition is a fraction of the
        price. Recurring monthly shows beat one-off events for learning, because you can come back
        with what you figured out.
      </P>
      <P>Before you pay a deposit, ask the organizer:</P>
      <Bullets
        items={[
          "Expected door count, and whether buyers pay to get in — a paid door usually means fewer but more serious buyers.",
          "How many vendor tables total, and how many are selling the same thing you are.",
          "Table size (6' and 8' are both common), whether chairs are included, and whether you get the space behind the table.",
          "Load-in time and whether you can pull a vehicle close.",
          "Whether power is available, and whether it costs extra.",
        ]}
      />
      <P>
        Then go walk the show as a buyer once before you sell at it. One afternoon of watching
        which tables have people standing at them will tell you more about what to bring than any
        checklist, including this one. The{" "}
        <Link href="/shows" className="text-sticker underline underline-offset-4">
          SoCal show calendar
        </Link>{" "}
        tracks dates, venues, and table costs across the Inland Empire so you can scout one before
        you book one.
      </P>

      <H2 id="inventory">3. What to actually stock</H2>
      <P>
        The most common first-table mistake is bringing the collection you are proudest of instead
        of the inventory that moves. Velocity beats prestige: ten $15 cards that sell beat one
        $150 card that goes home with you. Most first-table revenue comes out of the $5–40 band.
      </P>
      <P>A starting mix that works for most new vendors:</P>
      <Bullets
        items={[
          <>
            <strong className="text-ink">~60% singles in the $5–40 range.</strong> This is your
            engine. Sleeved, toploaded, clearly priced, sorted so someone can flip through without
            asking you anything.
          </>,
          <>
            <strong className="text-ink">~20% low-end bulk and binder stock, $1–5.</strong> The
            4-for-$10 box is not where you make your money — it is what makes people stop walking
            and start talking.
          </>,
          <>
            <strong className="text-ink">~15% sealed, if your bankroll allows.</strong> Predictable
            pricing, easy for buyers to value, thin margins. Good ballast, bad centerpiece.
          </>,
          <>
            <strong className="text-ink">~5% anchor pieces.</strong> One or two nicer cards to give
            people a reason to walk over. Treat them as traffic, not as revenue.
          </>,
        ]}
      />
      <Callout label="Leave it home">
        Your personal collection. If you would be annoyed to sell it at a fair price, it does not
        belong on the table — it will just occupy prime real estate and make you defensive when
        somebody offers.
      </Callout>

      <H2 id="sourcing">4. Sourcing without overpaying</H2>
      <P>
        Everything you make is decided on the buy, not the sell. A card bought badly is a card you
        will be carrying to shows for a year. Before you pay for anything, know two numbers: what
        it realistically sells for, and how fast.
      </P>
      <Bullets
        items={[
          "Buy collections, not singles, when you can. The bulk you did not want is what fills the $1–5 box, and that box pays for your table.",
          "For inventory you intend to move quickly, paying roughly half of realistic sell-through value leaves room for fees, a slow month, and being wrong. Slow-moving material should cost you less than that, not more.",
          "Price in the friction before you buy: shipping, sleeves and toploaders, grading if you are grading, and the card-reader fee on the way out.",
          "The end of a show is a sourcing event. Vendors would rather sell to each other at wholesale than pack it up again — walk the room in the last hour with cash.",
          "Local buys (Marketplace, OfferUp, shop trade-ins) beat online lots on price precisely because they are inconvenient. That inconvenience is your margin.",
        ]}
      />

      <H2 id="pricing">5. Pricing to comps</H2>
      <P>
        Price against what cards actually sold for, not what people are asking. Asking prices are
        a wish list; sold listings are a market. If you only check one thing before a show, check
        recent sold comps on your top twenty cards. The{" "}
        <Link href="/tools/price-checker" className="text-sticker underline underline-offset-4">
          price checker
        </Link>{" "}
        gives you market, low, and high on any Pokémon card, plus the most you can pay for one and
        still keep your margin.
      </P>
      <P>
        Give every card two numbers: the sticker price and your floor. Decide the floor at home,
        when you are calm, not across the table from someone who has been negotiating since
        breakfast. If a buyer goes below your floor, you have a rehearsed answer instead of a
        panicked one.
      </P>
      <Bullets
        items={[
          "Label everything. An unlabeled card means the buyer has to ask, and most people will not ask — they will just keep walking.",
          "Round numbers move faster than precise ones. $15 sells; $14.75 makes people do arithmetic.",
          "Build one deal into the table (4 for $10, or 10% off three or more). It gives you something to say and gives them a reason to keep looking.",
          "Reprice mid-day without ego. If nobody has touched a card by noon, the card is wrong or the price is.",
        ]}
      />
      <Callout label="The gap that justifies the table">
        Aim to beat what the buyer would pay online once shipping is included, while still beating
        what you would net online after fees and shipping. If your show price is not better than
        both of those, one of you is better off staying home.
      </Callout>

      <H2 id="booth">6. Booth setup that sells</H2>
      <P>
        A clean six-foot table with good light outperforms an expensive setup that is cluttered.
        Think in three zones and defend them.
      </P>
      <Bullets
        items={[
          <>
            <strong className="text-ink">Front edge — the browse zone.</strong> Bulk boxes and
            binders where people can dig without leaning over anything. This is what stops foot
            traffic.
          </>,
          <>
            <strong className="text-ink">Middle — the display zone.</strong> Risers to get your
            $5–40 singles up to eye level. Cards lying flat on a table are invisible from three
            feet away.
          </>,
          <>
            <strong className="text-ink">Beside or behind — the case.</strong> Anchors and anything
            you would not want to lose. Locked, and never out of your sight line.
          </>,
        ]}
      />
      <Bullets
        items={[
          "Bring your own light. Venue lighting is almost always worse than you remember, and dim cards look like damaged cards.",
          "Tablecloth to the floor. Your bins, bags, and lunch live underneath, out of sight.",
          "Two signs, maximum: your name and your deal. More than that and people read none of them.",
          "Leave yourself room to stand up and talk. A vendor pinned behind a wall of product sells less than one who can step out and hand somebody a card.",
        ]}
      />

      <H2 id="payments">7. Cash, cards, and the float</H2>
      <P>
        You will lose real sales to payment friction, and it is the cheapest problem on this page
        to fix.
      </P>
      <Bullets
        items={[
          "Bring a change float of roughly $150–200, weighted heavily toward $1s and $5s. Almost everyone underestimates the small bills.",
          "Take cards. A reader like Square runs about 2.6% plus a dime on card-present sales — decide in advance whether you absorb that or build it into your prices, and be consistent.",
          "Peer-to-peer apps are fine, but watch the confirmation on your own screen before the card leaves your hand. 'It says pending' is not a payment.",
          "Keep cash on your body, not in an open box on the table. A zip pouch on your belt beats a cash box every time.",
          "Post your accepted payment methods on a small sign so nobody has to ask mid-decision.",
        ]}
      />

      <H2 id="show-day">8. Show day, hour by hour</H2>
      <Bullets
        items={[
          <>
            <strong className="text-ink">Load-in.</strong> Arrive when the doors open for vendors,
            not when they open for buyers. Setting up while customers watch costs you the first
            hour.
          </>,
          <>
            <strong className="text-ink">Before doors.</strong> The first transactions of the day
            are usually vendor-to-vendor. Know your wholesale number on everything before you walk
            in, because you will be asked.
          </>,
          <>
            <strong className="text-ink">First two hours.</strong> Peak traffic. Stay standing,
            stay off your phone, and let people dig. Answer questions; do not hover.
          </>,
          <>
            <strong className="text-ink">Midday.</strong> Restock the front edge. The browse zone
            empties fastest and a picked-over box stops earning.
          </>,
          <>
            <strong className="text-ink">Last hour.</strong> This is when deals get made, in both
            directions. Decide beforehand what you would rather do: discount it or haul it home.
            Having decided in advance is the whole trick.
          </>,
        ]}
      />
      <Callout label="Log as you go">
        Write down every sale when it happens, not at the end of the day. Memory at 4pm after six
        hours on your feet is not a record-keeping system, and reconstructing a day of sales from
        a pile of cash is how cost basis gets lost.
      </Callout>

      <H2 id="legal">9. Permits and sales tax in California</H2>
      <P>
        This is the section new vendors skip and then worry about later. It is more
        straightforward than it looks, and the permit itself is free.
      </P>
      <Bullets
        items={[
          "If you are selling tangible goods in California, you generally need a seller's permit from the CDTFA. Making three or more sales of taxable items in a twelve-month period triggers the requirement — occasional selling still counts.",
          "Selling from one location for 90 days or less? That is a temporary seller's permit. It is free, you apply online, you can get it up to 90 days before your start date, and most complete applications are issued immediately.",
          "Expect the organizer to ask for your permit number. Under California law, operators of swap meets, flea markets, and special events cannot rent you space until they have collected that information, must keep the records for four years, and face penalties of up to $1,000 per seller if they do not. CDTFA-410-D is the form they will hand you — bring your number so you are not the person holding up load-in.",
          "Sales tax is state base plus district tax, and it varies by the venue's address, not your home address. In the Inland Empire, Riverside County's minimum combined rate is around 7.75%, while the cities of Riverside and San Bernardino sit near 8.75%. Look up the exact rate for the venue before the show.",
          "You can add tax at the register or price tax-included and back it out afterward. Both are acceptable. Pick one, be consistent, and note which you used.",
          "For 2026, payment platforms only issue a Form 1099-K above $20,000 in gross payments and more than 200 transactions. That threshold decides whether you get a form — it does not decide whether the income is taxable. It is taxable from the first dollar either way.",
        ]}
      />
      <Callout label="Not advice">
        This is a plain-language summary written by vendors, not attorneys or accountants. Rules
        change and your situation may differ. Verify with the CDTFA and a tax professional before
        your first show.
      </Callout>

      <H2 id="records">10. What to log</H2>
      <P>
        Cost basis is the difference between &ldquo;I made $800 today&rdquo; and &ldquo;I made $180
        today.&rdquo; If you only build one habit this year, build this one.
      </P>
      <P>For every item, capture:</P>
      <Bullets
        items={[
          "What you paid, and the date you paid it.",
          "Where it came from — collection buy, another vendor, online lot.",
          "What you sold it for, and what the payment cost you in fees.",
          "Which show it sold at, so you can tell which rooms actually work for you.",
        ]}
      />
      <P>
        A spreadsheet is enough to start. Our free{" "}
        <Link
          href="/tools/inventory-template"
          className="text-sticker underline underline-offset-4"
        >
          inventory + cost-basis template
        </Link>{" "}
        already has all four of those captured, with the cost basis pulled through to every sale
        and a per-show P&amp;L on the back of it. When a spreadsheet stops being enough, the{" "}
        <Link href="/dashboard" className="text-sticker underline underline-offset-4">
          Vendly back office
        </Link>{" "}
        does the same job with the arithmetic already wired up — inventory, sales, shows, and
        margins in one place.
      </P>

      <H2 id="after">11. The four numbers after</H2>
      <P>
        Before you unpack the car, write down four things. This takes five minutes and it is what
        turns a day of selling into a business.
      </P>
      <Bullets
        items={[
          <>
            <strong className="text-ink">Gross sales.</strong> Everything that came in, cash and
            card.
          </>,
          <>
            <strong className="text-ink">Cost basis of what sold.</strong> What you originally paid
            for the specific items that left the table.
          </>,
          <>
            <strong className="text-ink">Cost of the day.</strong> Table, gas, parking, food, help,
            processing fees.
          </>,
          <>
            <strong className="text-ink">Net profit and profit per hour.</strong> Include setup and
            teardown in the hours. This is the number that tells you whether to book the show
            again.
          </>,
        ]}
      />
      <P>
        Then one qualitative note: which category carried the day, and what did three different
        people ask for that you did not have? That note becomes next month&apos;s buy list.
      </P>

      <H2 id="faq">12. FAQ</H2>
      <div className="mt-6 space-y-4">
        {faqs.map((f) => (
          <details
            key={f.q}
            className="group rounded-lg border border-line bg-card p-5 open:border-sticker"
          >
            <summary className="display cursor-pointer list-none text-xl marker:content-none">
              <span className="flex items-start justify-between gap-4">
                {f.q}
                <span
                  aria-hidden
                  className="mt-1 shrink-0 font-mono text-sm text-sticker group-open:rotate-45"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-dim">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-14 rounded-lg border border-line bg-card p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Get the show-prep checklist
        </p>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          The printable version of this guide&apos;s show-day section, plus the free inventory
          template, go out to the list first.
        </p>
        <div className="mt-4">
          <EmailCapture cta="Send it to me" source="first-vendor-table" />
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/tools/profit-calculator"
          className="rounded bg-sticker px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide text-onaccent transition hover:-translate-y-0.5"
        >
          Run your break-even
        </Link>
        <Link
          href="/shows"
          className="rounded border border-dim px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide transition hover:-translate-y-0.5 hover:border-ink hover:bg-ink hover:text-paper"
        >
          Find a SoCal show
        </Link>
      </div>
    </article>
  );
}
