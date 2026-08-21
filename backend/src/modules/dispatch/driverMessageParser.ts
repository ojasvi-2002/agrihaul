// Pure parser for driver-side SMS commands — no DB access, mirrors
// messageProcessing/parser.ts's split between parsing and orchestration.
//
// Currently: LOC (report location) and DONE (finished the pickup). Not
// the READY/WAIT/ON/OFF grammar from manual.html — that was an
// explicitly different, rejected design.
export type DriverCommand =
  | { type: "LOC"; latitude: number; longitude: number }
  | { type: "DONE" }
  | { type: "UNKNOWN" };

const LOC_PATTERN = /^LOC\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i;

export function parseDriverMessage(raw: string): DriverCommand {
  const text = raw.trim();

  if (/^DONE$/i.test(text)) return { type: "DONE" };

  const match = text.match(LOC_PATTERN);
  if (match) {
    const latitude = parseFloat(match[1]);
    const longitude = parseFloat(match[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { type: "LOC", latitude, longitude };
    }
  }

  return { type: "UNKNOWN" };
}
