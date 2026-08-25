// Parses inbound farmer SMS into structured pickup-request fields.
// Migrated from js/intake.js (see docs/CURRENT_SYSTEM.md §5), extended
// with date extraction (CLAUDE.md Phase 7), a CANCEL intent, and a
// keyword-extraction fallback (2026-08-24 — not everyone remembers the
// exact format) for free-form phrasing.
//
// Two parsing strategies, tried in order:
//   1. Structured — NAME - PRODUCT - QUANTITY - LOCATION [- DATE], e.g.
//      KWAME - MAIZE - 200KG - AJUMAKO - FRIDAY. Position-based, exact.
//   2. Keyword fallback — only tried when (1) isn't confident. Scans the
//      whole message for a quantity+unit anywhere, a known crop name
//      anywhere, a date word anywhere, and a location after
//      at/from/near — order-independent, for messages like "Hey its
//      Kwame, 200kg maize ready at Ajumako on Friday".
//
// Both still refuse to guess at missing/invalid fields (CLAUDE.md §29):
// keyword mode only returns confident when it actually found a quantity,
// product, AND location — anything less falls through to the structured
// pass's confident: false result with its issues list, never a
// half-invented pickup.

export type ParsedPickupFields = {
  // Optional in keyword mode — the sender's phone number already
  // identifies the farmer (Phase 6); NAME is only ever used to fill in
  // a still-placeholder farmer name, and keyword mode has no reliable
  // way to isolate it from filler words ("Hey its Kwame...").
  name?: string;
  product: string;
  quantity: number;
  unit: string;
  location: string;
  requestedPickupDate: Date | null;
};

export type ParseResult =
  | { intent: "CANCEL" }
  | { intent: "IRRELEVANT" }
  | { intent: "PICKUP_REQUEST"; confident: true; fields: ParsedPickupFields; issues: [] }
  | { intent: "PICKUP_REQUEST"; confident: false; fields: Partial<ParsedPickupFields>; issues: string[] };

const QUANTITY_PATTERN = /^(\d+(?:\.\d+)?)\s*([A-Za-z]*)$/;

export function extractQuantity(token: string | undefined): { value: number; unit: string } | null {
  if (!token) return null;
  const match = token.trim().match(QUANTITY_PATTERN);
  if (!match) return null;
  return { value: parseFloat(match[1]), unit: match[2] ? match[2].toUpperCase() : "KG" };
}

const WEEKDAYS: Record<string, number> = {
  SUNDAY: 0,
  SUN: 0,
  MONDAY: 1,
  MON: 1,
  TUESDAY: 2,
  TUE: 2,
  TUES: 2,
  WEDNESDAY: 3,
  WED: 3,
  THURSDAY: 4,
  THU: 4,
  THUR: 4,
  THURS: 4,
  FRIDAY: 5,
  FRI: 5,
  SATURDAY: 6,
  SAT: 6,
};

function atMidnight(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isValidDate(d: Date) {
  return !isNaN(d.getTime());
}

// Silently returns null for anything unrecognized — an optional field the
// farmer got wrong shouldn't block an otherwise-valid pickup request.
export function extractDate(token: string | undefined, referenceDate: Date = new Date()): Date | null {
  if (!token) return null;
  const t = token.trim().toUpperCase();
  if (!t) return null;

  if (t === "TODAY") return atMidnight(referenceDate);
  if (t === "TOMORROW") {
    const d = atMidnight(referenceDate);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (t in WEEKDAYS) {
    const d = atMidnight(referenceDate);
    const diff = (WEEKDAYS[t] - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, day] = iso;
    const d = new Date(Number(y), Number(m) - 1, Number(day));
    return isValidDate(d) && d.getMonth() === Number(m) - 1 ? d : null;
  }

  const dm = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (dm) {
    const [, aStr, bStr, yearS] = dm;
    const a = Number(aStr);
    const b = Number(bStr);
    const year = yearS ? (yearS.length === 2 ? 2000 + Number(yearS) : Number(yearS)) : referenceDate.getFullYear();

    // This format is read day-first (matching the NAME - PRODUCT - QTY -
    // LOCATION - DATE examples this parser was built against). But when
    // the two numbers could *also* be read month-first and that swap
    // lands on a different, equally valid calendar date, there's no way
    // to know which the farmer meant — guessing risks creating a
    // PickupRequest for the wrong day with no review flag, which is
    // exactly what §29 says never to do. Only trust the day-first
    // reading when it's the only valid one.
    const dayFirst = new Date(year, b - 1, a);
    const dayFirstValid = isValidDate(dayFirst) && dayFirst.getMonth() === b - 1;

    if (a !== b) {
      const monthFirst = new Date(year, a - 1, b);
      const monthFirstValid = isValidDate(monthFirst) && monthFirst.getMonth() === a - 1;
      if (dayFirstValid && monthFirstValid) return null;
    }

    return dayFirstValid ? dayFirst : null;
  }

  return null;
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// A finite, known vocabulary — this is exactly what makes it "keyword
// extraction" rather than language understanding. A crop not on this
// list still falls through to needing review rather than being silently
// dropped; extend the list as real farmer messages reveal gaps.
const KNOWN_PRODUCTS: Record<string, string> = {
  maize: "Maize",
  corn: "Maize",
  rice: "Rice",
  olive: "Olives",
  olives: "Olives",
  bean: "Beans",
  beans: "Beans",
  coffee: "Coffee",
  cocoa: "Cocoa",
  wheat: "Wheat",
  cassava: "Cassava",
  yam: "Yams",
  yams: "Yams",
  cotton: "Cotton",
  groundnut: "Groundnuts",
  groundnuts: "Groundnuts",
  peanut: "Groundnuts",
  peanuts: "Groundnuts",
  potato: "Potatoes",
  potatoes: "Potatoes",
  tomato: "Tomatoes",
  tomatoes: "Tomatoes",
  onion: "Onions",
  onions: "Onions",
  millet: "Millet",
  sorghum: "Sorghum",
  plantain: "Plantains",
  plantains: "Plantains",
  banana: "Bananas",
  bananas: "Bananas",
  mango: "Mangoes",
  mangoes: "Mangoes",
  mangos: "Mangoes",
  cashew: "Cashews",
  cashews: "Cashews",
  pepper: "Peppers",
  peppers: "Peppers",
  okra: "Okra",
  cabbage: "Cabbage",
  cabbages: "Cabbage",
};

function findKnownProduct(text: string): string | null {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of words) {
    if (KNOWN_PRODUCTS[word]) return KNOWN_PRODUCTS[word];
  }
  return null;
}

const UNIT_WORDS = "kilograms?|kgs?|bags?|tonnes?|tons?|litres?|liters?|crates?|sacks?|baskets?|l";
const QUANTITY_ANYWHERE_PATTERN = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS})\\b`, "i");

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (u.startsWith("kilogram") || u.startsWith("kg")) return "KG";
  if (u.startsWith("bag")) return "BAGS";
  if (u.startsWith("ton")) return "TON";
  if (u.startsWith("litre") || u.startsWith("liter") || u === "l") return "L";
  if (u.startsWith("crate")) return "CRATES";
  if (u.startsWith("sack")) return "SACKS";
  if (u.startsWith("basket")) return "BASKETS";
  return u.toUpperCase();
}

// Scans every word-like token for a recognizable date, rather than only
// trusting the last word the way the structured parser does — a keyword
// message can put the date anywhere ("ready Friday at the farm").
function findDateAnywhere(text: string, referenceDate: Date): Date | null {
  const tokens = text.match(/[A-Za-z0-9/-]+/g) ?? [];
  for (const token of tokens) {
    const date = extractDate(token, referenceDate);
    if (date) return date;
  }
  return null;
}

// Looks for "at/from/near <place>" anywhere in the message. Captures up
// to 4 words after the preposition, then trims off any trailing
// connector word ("on", "for", "by") or word that's actually a date
// ("...at Belval on Saturday" must not leave "on Saturday" stuck to the
// location).
function findLocationAnywhere(text: string, referenceDate: Date): string | null {
  const match = text.match(/\b(?:at|from|near)\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*){0,3})/i);
  if (!match) return null;

  const words = match[1].split(/\s+/);
  while (words.length > 1) {
    const last = words[words.length - 1];
    if (/^(on|for|by)$/i.test(last) || extractDate(last, referenceDate)) {
      words.pop();
    } else {
      break;
    }
  }
  return words.join(" ");
}

// The fallback pass — only ever called when the structured parser
// couldn't confidently parse the message. Returns null (defer to the
// structured pass's own issues list) unless it found a quantity,
// product, AND location; never returns a partially-confident result of
// its own, to avoid two differently-worded "what's missing" messages for
// the same text.
function parseByKeyword(text: string, referenceDate: Date): ParseResult | null {
  const quantityMatch = text.match(QUANTITY_ANYWHERE_PATTERN);
  if (!quantityMatch) return null;
  const quantity = { value: parseFloat(quantityMatch[1]), unit: normalizeUnit(quantityMatch[2]) };
  if (quantity.value <= 0) return null;

  const product = findKnownProduct(text);
  if (!product) return null;

  const location = findLocationAnywhere(text, referenceDate);
  if (!location) return null;

  return {
    intent: "PICKUP_REQUEST",
    confident: true,
    issues: [],
    fields: {
      product,
      quantity: quantity.value,
      unit: quantity.unit,
      location: titleCase(location),
      requestedPickupDate: findDateAnywhere(text, referenceDate),
    },
  };
}

// See the comment where this is used, in parseStructured's non-dash
// branch — distinguishes terse shorthand from a natural sentence.
const FILLER_WORDS = new Set([
  "hey",
  "hi",
  "hello",
  "its",
  "it's",
  "im",
  "i'm",
  "i",
  "the",
  "a",
  "an",
  "this",
  "that",
  "have",
  "need",
  "got",
  "please",
]);

function parseStructured(text: string, referenceDate: Date): ParseResult {
  const dashParts = text
    .split(/\s*-\s*/)
    .map((p) => p.trim())
    .filter((p) => p !== "");

  // Not even an attempt at the structured format — ordinary chat like
  // "Hello" or "What time are you coming?" — leave it alone (§18).
  const looksLikePickupAttempt = dashParts.length >= 2 || /\d/.test(text);
  if (!looksLikePickupAttempt) {
    return { intent: "IRRELEVANT" };
  }

  let nameRaw: string | undefined;
  let productRaw: string | undefined;
  let qtyRaw: string | undefined;
  let locationRaw: string | undefined;
  let dateRaw: string | undefined;

  // A genuine dash-separator has whitespace on at least one side ("NAME -
  // PRODUCT", "NAME- PRODUCT", "NAME -PRODUCT" — real phone-typing habits
  // vary on which side gets the space), which a hyphen embedded in a
  // single word ("Cape-Coast") never has on *either* side. Requiring at
  // least one distinguishes "farmer used the dash format" from "farmer
  // used spaces but one place/product name happens to have a hyphen in
  // it" — the latter must fall through to whitespace parsing below, or it
  // gets shredded on the incidental hyphen instead. (Originally required
  // whitespace on both sides, which rejected the very common "word- word"
  // phone-typing style and silently mis-parsed it as free text instead.)
  const looksLikeDashFormat = /\s-|-\s/.test(text);

  if (looksLikeDashFormat) {
    // Farmer used the dash format — trust it exactly as given, even if a
    // field is missing, rather than falling back to whitespace splitting
    // (which would misread the leftover dashes as tokens of their own).
    // A trailing date can itself contain dashes (e.g. an ISO date or a
    // DD-MM date) — the blind split above already shredded it, so
    // anything past the 4 core fields gets rejoined into one date string.
    [nameRaw, productRaw, qtyRaw, locationRaw] = dashParts;
    if (dashParts.length > 4) {
      dateRaw = dashParts.slice(4).join("-");
    }
  } else {
    // No dashes at all — split on whitespace instead. The last token
    // might be a trailing date; only claim it as one if it actually
    // parses as a date, otherwise it's part of the location.
    const parts = text.split(/\s+/).filter(Boolean);
    [nameRaw, productRaw, qtyRaw] = parts;
    let locParts = parts.slice(3);
    const lastToken = locParts[locParts.length - 1];
    if (locParts.length > 1 && extractDate(lastToken, referenceDate)) {
      dateRaw = lastToken;
      locParts = locParts.slice(0, -1);
    }
    locationRaw = locParts.join(" ");

    // A real terse shorthand message ("Kwame Maize 200 Ajumako") never
    // opens with a natural-sentence filler word — only free-form
    // phrasing does ("Hey its Kwame...", "I have 200kg..."). Without
    // this check, a bare number that happens to land in word 3 of an
    // ordinary sentence (e.g. "...3 bags of rice...") gets confidently
    // misread as the quantity, silently creating a wrong pickup instead
    // of deferring to the keyword-extraction fallback below (§29: never
    // invent). Blanking qtyRaw here forces "missing quantity", which is
    // enough to keep this result from being trusted as confident.
    const firstWord = (nameRaw ?? "").toLowerCase().replace(/[^a-z']/g, "");
    const secondWord = (productRaw ?? "").toLowerCase().replace(/[^a-z']/g, "");
    if (FILLER_WORDS.has(firstWord) || FILLER_WORDS.has(secondWord)) {
      qtyRaw = undefined;
    }
  }

  const issues: string[] = [];
  if (!nameRaw) issues.push("missing farmer name");
  if (!productRaw) issues.push("missing product");
  if (!qtyRaw) issues.push("missing quantity");
  const quantity = extractQuantity(qtyRaw);
  if (qtyRaw && !quantity) issues.push("quantity not numeric");
  // extractQuantity("0KG") returns a truthy {value: 0, unit: "KG"} —
  // check the actual value, not just object presence, or a zero-quantity
  // pickup request would confidently create a PickupRequest for nothing.
  if (quantity && quantity.value <= 0) issues.push("quantity must be greater than zero");
  if (!locationRaw) issues.push("missing location");

  const requestedPickupDate = extractDate(dateRaw, referenceDate);

  if (issues.length > 0) {
    return {
      intent: "PICKUP_REQUEST",
      confident: false,
      issues,
      fields: {
        name: nameRaw ? titleCase(nameRaw) : undefined,
        product: productRaw ? titleCase(productRaw) : undefined,
        quantity: quantity?.value,
        unit: quantity?.unit,
        location: locationRaw ? titleCase(locationRaw) : undefined,
        requestedPickupDate,
      },
    };
  }

  return {
    intent: "PICKUP_REQUEST",
    confident: true,
    issues: [],
    fields: {
      name: titleCase(nameRaw!),
      product: titleCase(productRaw!),
      quantity: quantity!.value,
      unit: quantity!.unit,
      location: titleCase(locationRaw!),
      requestedPickupDate,
    },
  };
}

export function parseIncomingSms(raw: string, referenceDate: Date = new Date()): ParseResult {
  const text = (raw || "").trim();
  if (!text) return { intent: "IRRELEVANT" };

  const upper = text.toUpperCase();
  if (upper === "CANCEL" || upper.startsWith("CANCEL ")) {
    return { intent: "CANCEL" };
  }

  const structured = parseStructured(text, referenceDate);
  if (structured.intent !== "PICKUP_REQUEST" || structured.confident) {
    return structured;
  }

  // The structured pass recognized this as an attempt but couldn't
  // confidently parse it — try reading it as free-form phrasing before
  // giving up and flagging it for review.
  return parseByKeyword(text, referenceDate) ?? structured;
}
