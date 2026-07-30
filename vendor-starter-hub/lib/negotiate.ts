/**
 * Drafting an offer message for a card on the watchlist.
 *
 * WHAT THIS IS. A composer. It turns numbers the app already holds — the
 * card, the finish, today's market, the recorded 30-day average, and the
 * user's own ceiling — into a short, polite, specific message the vendor can
 * read, edit and send themselves.
 *
 * WHAT THIS IS NOT, AND WILL NOT BECOME. It does not send. It has no inbox,
 * no seller, no address and no API to reach one. There is no code path in
 * this file or its caller that transmits anything; the only exit is the
 * clipboard. That is deliberate and it is the whole safety story of the
 * feature: a bot that messages strangers on your behalf, in your name, about
 * money, is a way to get an account banned and a reputation dented at a show
 * where everyone knows everyone.
 *
 * THE ONE RULE THE NUMBERS FOLLOW. The offer is never above the ceiling the
 * user set, and never above today's market. Nothing here invents a discount.
 * The only adjustment applied is rounding DOWN to a clean number, because
 * "$70" is a thing people say out loud and "$71.40" is not. Any lowball
 * beyond that would be this file negotiating on the user's behalf with a
 * figure nothing in the data supports.
 *
 * THE EVIDENCE RULE. The draft may cite the card's own recorded average, and
 * only that. It may not cite a listing, a seller, an auction or "the market
 * elsewhere" — the app has never seen one. It cites the average only when
 * there are enough recorded days to mean something, and only when today is
 * actually below it; quoting an average you are currently ABOVE is arguing
 * the other side's case for them.
 */

export type Channel = "in_person" | "online";

export type ShowContext = {
  name: string;
  /** Date-only string, YYYY-MM-DD, as stored on the shows table. */
  date: string | null;
};

export type DraftInput = {
  cardName: string;
  setName: string | null;
  cardNumber: string | null;
  finishLabel: string | null;
  /** Today's reference price for this card and finish. */
  market: number | null;
  /** Average across recorded days. Null when nothing has been recorded. */
  average: number | null;
  recordedDays: number;
  /** The most this user said they would pay, already recomputed for today. */
  ceiling: number | null;
  channel: Channel;
  /** The vendor's next show, when they have one. Optional context, never invented. */
  show: ShowContext | null;
};

/**
 * Below this many recorded days the average is not a claim worth making in
 * front of someone who may know the card better than you do. Matches the
 * default `min_recorded_days` on alert_settings on purpose: the app should
 * not be willing to say something in a message that it would not be willing
 * to buzz you about.
 */
export const MIN_DAYS_TO_CITE = 7;

/** A lock-screen has a limit; so does a stranger's patience. */
export const MAX_LEN = 700;

export type Blocked =
  /** Percent target with no market price behind it: no ceiling exists. */
  | "no_ceiling"
  /** Nothing to anchor an offer to. */
  | "no_market"
  /** Rounding a sub-dollar ceiling down leaves nothing to offer. */
  | "too_small";

export type Draft =
  | { ok: false; reason: Blocked }
  | {
      ok: true;
      text: string;
      /** The number in the message. Always <= ceiling and <= market. */
      offer: number;
      /** Room left between the offer and whichever limit bound it. */
      headroom: number;
      /**
       * Which limit that was. The UI has to say, because "you have room left"
       * means two different things: room under a number you chose, or room
       * under today's market on a card you have already priced well below it.
       */
      boundBy: "ceiling" | "market";
      /** Whether the recorded average made it into the text. */
      cited: boolean;
    };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * The nearest number a person would actually say, at or below the input.
 *
 * Always rounds down, never up. Rounding up would push the offer past a
 * ceiling the user set deliberately, which is the one thing this file is not
 * allowed to do — and it would do it silently, inside a message they are
 * about to send with their own name on it.
 */
export function cleanOffer(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n < 20 ? 1 : n < 200 ? 5 : 10;
  const down = Math.floor(n / step) * step;
  // A $3 card at step 1 floors to 3; a $0.80 one floors to 0, which is not an
  // offer. Fall back to the real figure rather than emit nothing.
  return down >= 1 ? down : round2(n);
}

/**
 * How the card gets named in the message.
 *
 * Set and number are included when known because "Charizard" is forty
 * different cards and the wrong one is an argument at the table. Finish is
 * included for the same reason — holo and reverse holo are different money.
 */
export function cardLabel(i: DraftInput): string {
  const bits = [i.setName, i.cardNumber ? `#${i.cardNumber}` : null]
    .filter(Boolean)
    .join(" ");
  const paren = [bits || null, i.finishLabel].filter(Boolean).join(", ");
  return paren ? `${i.cardName} (${paren})` : i.cardName;
}

/**
 * "Saturday, Aug 8" from a date-only string, without letting a timezone move
 * it to Friday. Returns null for anything unparseable, and the caller then
 * simply omits the day rather than printing a guess.
 */
export function showDay(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Is the recorded history strong enough, and pointing the right way, to be
 * worth putting in a message?
 *
 * Two separate questions, and both have to be yes. Enough days, because an
 * average over three of them is not an average anyone should act on. And
 * below the average today, because citing a figure you are currently ABOVE
 * hands the other side the argument.
 */
export function canCite(i: DraftInput): boolean {
  return (
    i.average !== null &&
    i.average > 0 &&
    i.market !== null &&
    i.market > 0 &&
    i.recordedDays >= MIN_DAYS_TO_CITE &&
    i.market < i.average
  );
}

/**
 * Compose the message.
 *
 * Every sentence below is either a fact already in the database or a sentence
 * about the sender's own intent. Nothing asserts anything about the seller,
 * their listing, their price or their motives, because the app knows none of
 * those things.
 */
export function draftOffer(i: DraftInput): Draft {
  if (i.market === null || i.market <= 0) return { ok: false, reason: "no_market" };
  if (i.ceiling === null || !Number.isFinite(i.ceiling))
    return { ok: false, reason: "no_ceiling" };

  // Never above the ceiling, never above market. Whichever binds first wins.
  const base = Math.min(i.ceiling, i.market);
  const offer = cleanOffer(base);
  if (offer <= 0) return { ok: false, reason: "too_small" };

  const cited = canCite(i);
  const card = cardLabel(i);
  const day = i.show ? showDay(i.show.date) : null;

  const lines: string[] = [];

  lines.push(
    i.channel === "in_person"
      // "the", not "a": English article agreement depends on the sound a card
      // name starts with, not its first letter ("an Umbreon", "a Unown"), and
      // getting it wrong in the opening four words is what makes a message
      // read as machine-written. "the" sidesteps the problem entirely.
      ? `Hi — do you have the ${card} with you today?`
      : `Hi — is your ${card} still available?`,
  );

  if (cited) {
    lines.push(
      `I've been tracking it: it has averaged ${money(i.average!)} across ${i.recordedDays} recorded days, and market today is ${money(i.market)}.`,
    );
  }

  lines.push(
    i.channel === "in_person"
      ? `I can do ${money(offer)} cash on it right now.`
      : `I can do ${money(offer)}, paid today.`,
  );

  if (i.show && i.channel === "online") {
    lines.push(
      day
        ? `I'm vending ${i.show.name} on ${day} if meeting there is easier than shipping.`
        : `I'm vending ${i.show.name} if meeting there is easier than shipping.`,
    );
  }

  lines.push(
    i.channel === "in_person"
      ? `No worries either way — thanks for letting me look.`
      : `No worries if not — thanks either way.`,
  );

  const text = lines.join(" ").slice(0, MAX_LEN);

  // Headroom is measured against whichever limit actually bound the offer, not
  // against the ceiling alone. On a card where market came in far below the
  // ceiling, "you have $430 of room left" is true of the ceiling and wildly
  // false as advice — it would talk someone into paying six times the going
  // rate for a card they had already priced correctly.
  return {
    ok: true,
    text,
    offer,
    headroom: round2(base - offer),
    boundBy: i.market < i.ceiling ? "market" : "ceiling",
    cited,
  };
}

/** Why a row cannot be drafted, said in a sentence the vendor can act on. */
export function blockedReason(r: Blocked): string {
  switch (r) {
    case "no_market":
      return "There is no published price for this card and finish right now, so there is no number to build an offer around.";
    case "no_ceiling":
      return "A percentage target needs a market price to turn into a dollar figure, and there isn't one today. A fixed buy-under ceiling would still work.";
    case "too_small":
      return "The ceiling on this watch is under a dollar, which is not an offer worth typing out.";
  }
}

