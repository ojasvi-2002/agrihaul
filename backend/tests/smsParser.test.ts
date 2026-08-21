// Pure unit tests for the SMS parser — no database involved. Covers
// CLAUDE.md §42's message-processing test list directly.
import { describe, it, expect } from "vitest";
import { parseIncomingSms, extractQuantity, extractDate } from "../src/modules/messageProcessing/parser";

describe("parseIncomingSms", () => {
  it("parses a valid pickup request", () => {
    const result = parseIncomingSms("KWAME - MAIZE - 200KG - AJUMAKO");
    expect(result.intent).toBe("PICKUP_REQUEST");
    if (result.intent !== "PICKUP_REQUEST" || !result.confident) throw new Error("expected confident parse");
    expect(result.fields).toEqual({
      name: "Kwame",
      product: "Maize",
      quantity: 200,
      unit: "KG",
      location: "Ajumako",
      requestedPickupDate: null,
    });
  });

  it("flags an incomplete pickup request instead of guessing", () => {
    const result = parseIncomingSms("KWAME - MAIZE - 200KG"); // missing location
    expect(result.intent).toBe("PICKUP_REQUEST");
    if (result.intent !== "PICKUP_REQUEST") throw new Error("expected pickup intent");
    expect(result.confident).toBe(false);
    expect(result.issues).toContain("missing location");
  });

  it("flags a non-numeric quantity as ambiguous, never invents a number", () => {
    const result = parseIncomingSms("SEKOU - RICE - LOTS - KANKAN");
    expect(result.intent).toBe("PICKUP_REQUEST");
    if (result.intent !== "PICKUP_REQUEST") throw new Error("expected pickup intent");
    expect(result.confident).toBe(false);
    expect(result.issues).toContain("quantity not numeric");
  });

  it("treats ordinary chat as irrelevant, not an incomplete pickup", () => {
    expect(parseIncomingSms("Hello").intent).toBe("IRRELEVANT");
    expect(parseIncomingSms("Thanks!").intent).toBe("IRRELEVANT");
    expect(parseIncomingSms("What time are you coming?").intent).toBe("IRRELEVANT");
  });

  it("recognizes CANCEL as its own intent", () => {
    expect(parseIncomingSms("CANCEL").intent).toBe("CANCEL");
    expect(parseIncomingSms("cancel please").intent).toBe("CANCEL");
  });

  it("handles different quantity/unit formats", () => {
    expect(extractQuantity("200KG")).toEqual({ value: 200, unit: "KG" });
    expect(extractQuantity("200 KG")).toEqual({ value: 200, unit: "KG" });
    expect(extractQuantity("150L")).toEqual({ value: 150, unit: "L" });
    expect(extractQuantity("80")).toEqual({ value: 80, unit: "KG" }); // no unit -> defaults to KG
    expect(extractQuantity("3.5BAGS")).toEqual({ value: 3.5, unit: "BAGS" });
    expect(extractQuantity("LOTS")).toBeNull();
  });

  it("extracts an optional trailing date field", () => {
    const withDate = parseIncomingSms("KWAME - MAIZE - 200KG - AJUMAKO - TOMORROW");
    if (withDate.intent !== "PICKUP_REQUEST" || !withDate.confident) throw new Error("expected confident parse");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    expect(withDate.fields.requestedPickupDate).toEqual(tomorrow);
  });

  it("silently drops an unrecognized trailing date rather than blocking the request", () => {
    const result = parseIncomingSms("KWAME - MAIZE - 200KG - AJUMAKO - WHENEVER");
    expect(result.intent).toBe("PICKUP_REQUEST");
    if (result.intent !== "PICKUP_REQUEST" || !result.confident) throw new Error("expected confident parse");
    expect(result.fields.requestedPickupDate).toBeNull();
  });

  it("extracts a trailing ISO-format date even though the date itself contains dashes", () => {
    const result = parseIncomingSms("KWAME - MAIZE - 200KG - AJUMAKO - 2026-09-01");
    expect(result.intent).toBe("PICKUP_REQUEST");
    if (result.intent !== "PICKUP_REQUEST" || !result.confident) throw new Error("expected confident parse");
    expect(result.fields.requestedPickupDate).toEqual(new Date(2026, 8, 1));
  });

  it("doesn't misroute a whitespace-separated message with an incidental hyphen into dash-parsing", () => {
    const result = parseIncomingSms("Yaw Maize 150KG Cape-Coast");
    expect(result.intent).toBe("PICKUP_REQUEST");
    if (result.intent !== "PICKUP_REQUEST" || !result.confident) throw new Error("expected confident parse");
    expect(result.fields).toEqual({
      name: "Yaw",
      product: "Maize",
      quantity: 150,
      unit: "KG",
      location: "Cape-Coast",
      requestedPickupDate: null,
    });
  });

  it("flags a zero quantity for review instead of creating an empty pickup", () => {
    const result = parseIncomingSms("KWAME - MAIZE - 0KG - AJUMAKO");
    expect(result.intent).toBe("PICKUP_REQUEST");
    if (result.intent !== "PICKUP_REQUEST") throw new Error("expected pickup intent");
    expect(result.confident).toBe(false);
    expect(result.issues).toContain("quantity must be greater than zero");
  });
});

describe("extractDate", () => {
  const monday = new Date(2026, 7, 24); // a known Monday (Aug 24 2026)

  it("resolves TODAY and TOMORROW", () => {
    expect(extractDate("TODAY", monday)).toEqual(new Date(2026, 7, 24));
    expect(extractDate("TOMORROW", monday)).toEqual(new Date(2026, 7, 25));
  });

  it("resolves a weekday name to its next occurrence", () => {
    expect(extractDate("FRIDAY", monday)).toEqual(new Date(2026, 7, 28));
    expect(extractDate("MON", monday)).toEqual(new Date(2026, 7, 24)); // today counts
  });

  it("parses DD/MM and ISO dates", () => {
    expect(extractDate("25/08", monday)).toEqual(new Date(2026, 7, 25));
    expect(extractDate("2026-09-01", monday)).toEqual(new Date(2026, 8, 1));
  });

  it("rejects an invalid date rather than rolling it over", () => {
    expect(extractDate("31/02", monday)).toBeNull(); // no Feb 31st
  });

  it("refuses to guess a genuinely ambiguous DD/MM-vs-MM/DD date", () => {
    // 03/04 is valid either way: April 3rd (day-first) or March 4th
    // (month-first) — no way to know which the farmer meant.
    expect(extractDate("03/04", monday)).toBeNull();
  });

  it("still resolves an unambiguous numeric date even when day <= 12", () => {
    // 05/05 reads the same regardless of which number is "day" — not
    // ambiguous just because both numbers happen to be <= 12.
    expect(extractDate("05/05", monday)).toEqual(new Date(2026, 4, 5));
  });
});
