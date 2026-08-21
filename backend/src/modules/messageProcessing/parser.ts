// Parses inbound farmer SMS into structured pickup-request fields.
// Migrated from js/intake.js (see docs/CURRENT_SYSTEM.md §5), extended
// with date extraction (CLAUDE.md Phase 7) and a CANCEL intent.
//
// Format (confirmed with the developer — the phone number already
// identifies the farmer via Phase 6, but NAME is kept to match existing
// onboarding materials):
//   NAME - PRODUCT - QUANTITY - LOCATION [- DATE]
//   e.g. KWAME - MAIZE - 200KG - AJUMAKO - FRIDAY
//
// Never guesses at missing or invalid fields (CLAUDE.md §29) — an
// incomplete/ambiguous message comes back with confident: false and a
// list of issues, not a best-effort pickup request.

export type ParsedPickupFields = {
  name: string;
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
    const [, dayS, monS, yearS] = dm;
    const mon = Number(monS);
    const year = yearS ? (yearS.length === 2 ? 2000 + Number(yearS) : Number(yearS)) : referenceDate.getFullYear();
    const d = new Date(year, mon - 1, Number(dayS));
    return isValidDate(d) && d.getMonth() === mon - 1 ? d : null;
  }

  return null;
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseIncomingSms(raw: string, referenceDate: Date = new Date()): ParseResult {
  const text = (raw || "").trim();
  if (!text) return { intent: "IRRELEVANT" };

  const upper = text.toUpperCase();
  if (upper === "CANCEL" || upper.startsWith("CANCEL ")) {
    return { intent: "CANCEL" };
  }

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

  // A genuine dash-separator has whitespace on both sides ("NAME - PRODUCT"),
  // which a hyphen embedded in a single word ("Cape-Coast") never does.
  // Requiring that distinguishes "farmer used the dash format" from
  // "farmer used spaces but one place/product name happens to have a
  // hyphen in it" — the latter must fall through to whitespace parsing
  // below, or it gets shredded on the incidental hyphen instead.
  const looksLikeDashFormat = /\s-\s/.test(text);

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
  }

  const issues: string[] = [];
  if (!nameRaw) issues.push("missing farmer name");
  if (!productRaw) issues.push("missing product");
  if (!qtyRaw) issues.push("missing quantity");
  const quantity = extractQuantity(qtyRaw);
  if (qtyRaw && !quantity) issues.push("quantity not numeric");
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
