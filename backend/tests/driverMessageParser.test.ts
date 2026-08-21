import { describe, it, expect } from "vitest";
import { parseDriverMessage } from "../src/modules/dispatch/driverMessageParser";

describe("parseDriverMessage", () => {
  it("recognizes DONE case-insensitively", () => {
    expect(parseDriverMessage("DONE")).toEqual({ type: "DONE" });
    expect(parseDriverMessage("done")).toEqual({ type: "DONE" });
    expect(parseDriverMessage("  Done  ")).toEqual({ type: "DONE" });
  });

  it("parses a valid LOC command", () => {
    expect(parseDriverMessage("LOC 14.6928 -17.4467")).toEqual({
      type: "LOC",
      latitude: 14.6928,
      longitude: -17.4467,
    });
  });

  it("rejects out-of-range coordinates", () => {
    expect(parseDriverMessage("LOC 200 -17.4467")).toEqual({ type: "UNKNOWN" });
    expect(parseDriverMessage("LOC 14.6928 -400")).toEqual({ type: "UNKNOWN" });
  });

  it("treats anything else as unrecognized, never guessing", () => {
    expect(parseDriverMessage("Hello")).toEqual({ type: "UNKNOWN" });
    expect(parseDriverMessage("READY 500 KG")).toEqual({ type: "UNKNOWN" }); // rejected manual.html grammar
    expect(parseDriverMessage("")).toEqual({ type: "UNKNOWN" });
  });
});
