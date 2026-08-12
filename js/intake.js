// js/intake.js
// SMS intake pipeline, modeled on the GreenEarth Connect aggregation flow:
// farmer sends a structured text, the gateway logs the raw message, a
// parsing layer pulls out NAME / PRODUCT / QUANTITY / LOCATION, and
// anything that doesn't parse cleanly is held for manual review instead
// of being silently dropped or auto-approved.
//
// Expected farmer format (SMS only, no app or data connection required):
//   NAME - PRODUCT - QUANTITY - LOCATION
//   e.g. KWAME - RED OIL - 200L - AJUMAKO
//
// This mirrors the "Requests" tab you'd publish from Google Sheets once
// Twilio (or Africa's Talking) is wired up to write inbound SMS there.
// Until then it runs on seed data below, same pattern as data.js.

const SEED_REQUESTS = [
  { Phone: "+233 24 000 0010", Raw: "KWAME - RED OIL - 200L - AJUMAKO",      ReceivedAt: "2025-05-24 07:12" },
  { Phone: "+221 77 000 0001", Raw: "AMINA - MILLET - 150KG - THIES",        ReceivedAt: "2025-05-24 07:40" },
  { Phone: "+233 24 000 0099", Raw: "YAA - COCOA - 80 - KOFORIDUA",          ReceivedAt: "2025-05-24 08:02" },
  { Phone: "+225 07 000 0003", Raw: "FATOU CASSAVA 300KG BOUAKE",            ReceivedAt: "2025-05-24 08:20" },
  { Phone: "+224 62 000 0014", Raw: "SEKOU - RICE - - KANKAN",               ReceivedAt: "2025-05-24 08:35" },
];

let _requestSeq = 1;

// Splits a raw SMS body into name / product / quantity / location.
// Farmers who don't use dashes still get a best-effort parse; anything
// that comes up short is flagged in `issues` rather than guessed at.
function parseIntakeMessage(raw) {
  const text = (raw || "").trim();
  let parts = text.split(/\s*-\s*/).map(p => p.trim()).filter(p => p !== "");

  if (parts.length < 3) {
    parts = text.split(/\s+/).filter(Boolean);
  }

  const [nameRaw, productRaw, qtyRaw, ...locParts] = parts;
  const locationRaw = locParts.join(" ");
  const issues = [];

  if (!nameRaw)     issues.push("missing farmer name");
  if (!productRaw)  issues.push("missing product");
  if (!qtyRaw)      issues.push("missing quantity");
  if (!locationRaw) issues.push("missing location");

  const qtyMatch = (qtyRaw || "").match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]*)$/);
  if (qtyRaw && !qtyMatch) issues.push("quantity not numeric");

  const fields = {
    name:     nameRaw ? titleCase(nameRaw) : "",
    product:  productRaw ? titleCase(productRaw) : "",
    quantity: qtyMatch ? parseFloat(qtyMatch[1]) : null,
    unit:     qtyMatch && qtyMatch[2] ? qtyMatch[2].toUpperCase() : "KG",
    location: locationRaw ? titleCase(locationRaw) : "",
  };

  return { ok: issues.length === 0, issues, fields };
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// FIXED: String(p) guards against non-string phone values. parseCSV()
// (js/data.js) no longer coerces Phone columns to numbers, but this
// extra guard means normalizePhone() never throws even if a caller
// passes a raw number, null, or undefined — it just returns "".
function normalizePhone(p) {
  return String(p || "").replace(/\D/g, "");
}

function matchFarmerByPhone(phone, farmers) {
  return farmers.find(f => normalizePhone(f.Phone) === normalizePhone(phone)) || null;
}

// Rebuilds the working queue from raw inbound messages plus the current
// farmer list. Requests that already exist (matched by phone + raw text)
// keep their id and status, so a manual confirm/dispatch survives a
// refresh. New rows are parsed, matched against known farmers, and
// checked against everything already in "ready" or later state for
// likely duplicates.
function buildRequestQueue(rawRequests, farmers, existingQueue = []) {
  const queue = rawRequests.map(r => {
    const prior = existingQueue.find(q => q.raw === r.Raw && q.phone === r.Phone);
    if (prior) return prior;

    const parsed = parseIntakeMessage(r.Raw);
    const farmer = matchFarmerByPhone(r.Phone, farmers);

    return {
      id: `REQ-${String(_requestSeq++).padStart(3, "0")}`,
      phone: r.Phone,
      raw: r.Raw,
      receivedAt: r.ReceivedAt,
      fields: parsed.fields,
      issues: parsed.issues,
      status: parsed.ok ? "ready" : "review",
      farmerKnown: !!farmer,
      farmerName: farmer ? farmer.Name : parsed.fields.name,
    };
  });

  // Flag duplicates: same phone, product, quantity and location as
  // another request already past the review stage.
  const seen = new Set();
  queue.forEach(r => {
    if (r.status === "review" || r.status === "duplicate") return;
    const key = [normalizePhone(r.phone), r.fields.product, r.fields.quantity, r.fields.location]
      .join("|").toLowerCase();
    if (seen.has(key) && r.status === "ready") {
      r.status = "duplicate";
    } else {
      seen.add(key);
    }
  });

  return queue;
}
