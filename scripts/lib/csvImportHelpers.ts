// Shared helpers for the scripts/import*FromCsv.ts migration scripts
// (CLAUDE.md §36). Kept here rather than duplicated per-script since all
// three genuinely need the identical logic.
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

export { getPrismaClient } from "./prismaClient";

export function parseArgs(usage: string) {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const orgArg = args.find((a) => a.startsWith("--org="));
  const csvPath = args.find((a) => !a.startsWith("--"));
  if (!csvPath || !orgArg) {
    console.error(usage);
    process.exit(1);
  }
  return { csvPath: csvPath!, orgSlug: orgArg!.slice("--org=".length), commit };
}

export async function findOrgOrExit(prisma: PrismaClient, slug: string) {
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) {
    console.error(`No organization found with slug "${slug}"`);
    await prisma.$disconnect();
    process.exit(1);
  }
  return organization;
}

export type Row = Record<string, string>;

export function readCsvRows(csvPath: string): Row[] {
  const text = fs.readFileSync(path.resolve(csvPath), "utf-8");
  // Sheet exports sometimes have stray whitespace in header names
  // (seen in Broadcasts.csv: "SentAt ", " RecipientCount ") — trim both
  // headers and values so lookups by column name are reliable.
  const rows: Row[] = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  return rows.map((row) => {
    const cleaned: Row = {};
    for (const [key, value] of Object.entries(row)) cleaned[key.trim()] = value;
    return cleaned;
  });
}

export function reportUnmappedColumns(rows: Row[], knownColumns: Set<string>) {
  if (!rows.length) return;
  const unmapped = Object.keys(rows[0]).filter((c) => !knownColumns.has(c));
  if (unmapped.length) {
    console.log(`Note: columns present but not mapped to any field: ${unmapped.join(", ")}\n`);
  }
}

// Requires E.164-ish format (a leading "+" and a country code) — a
// number without one can't actually be dispatched to via Twilio, so
// accepting it here would just produce a Driver/Farmer record that
// silently can't receive SMS later. Rejects Excel/Sheets error values
// (#ERROR!, #N/A, #REF!, ...) too.
export function validatePhone(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const value = raw.trim().replace(/[\s()\-.]/g, "");
  if (!value) return { ok: false, reason: "missing phone number" };
  if (raw.trim().startsWith("#")) return { ok: false, reason: `spreadsheet error value ("${raw.trim()}")` };
  if (/[a-zA-Z]/.test(value)) return { ok: false, reason: `not a phone number ("${raw.trim()}")` };
  if (!value.startsWith("+")) {
    return { ok: false, reason: `missing country code — "${raw.trim()}" isn't in +<countrycode> format, needed for SMS dispatch to work` };
  }
  const digitCount = (value.match(/\d/g) || []).length;
  if (digitCount < 8) return { ok: false, reason: `too short to be a real phone number ("${raw.trim()}")` };
  return { ok: true, value };
}

export function isPlaceholder(value: string) {
  const v = value.trim();
  return !v || v === "—" || v === "-" || v.toLowerCase() === "n/a";
}

export function parseSheetDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
