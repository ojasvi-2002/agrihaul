/**
 * scripts/importFarmersFromCsv.ts
 *
 * CLAUDE.md §36 — Google Sheets → PostgreSQL migration, Farmers tab.
 * Import a CSV exported from the Farmers tab of the old prototype's
 * spreadsheet (Google Sheets: File → Download → CSV for a single tab —
 * one CSV per tab, typically named "<workbook> - <tab>.csv").
 *
 * SAFETY MODEL — read before running:
 *   - Defaults to DRY RUN: parses, validates, and reports what it would
 *     do, but writes nothing to the database.
 *   - Pass --commit to actually write.
 *   - Idempotent: re-running (even with --commit) never creates
 *     duplicate farmers — matched by (organizationId, phoneNumber) and
 *     updated in place, not re-created.
 *   - Never invents data: a row missing a required field, or with an
 *     obviously-invalid one (e.g. a literal spreadsheet error value like
 *     "#ERROR!", or a phone number missing its country code), is
 *     skipped and reported — never guessed at (§29).
 *
 * USAGE
 *   npx tsx scripts/importFarmersFromCsv.ts <csv-path> --org=<organization-slug> [--commit]
 *
 * COLUMNS RECOGNIZED (from the original prototype — see
 * docs/CURRENT_SYSTEM.md and js/data.js):
 *   Name        -> Farmer.name                (required)
 *   Phone       -> Farmer.phoneNumber          (required, E.164 format)
 *   Village     -> Farm.name / Farm.address    (optional — creates a Farm
 *                                                only when a real value,
 *                                                not a placeholder, is given)
 *   Lat, Lon    -> Farm.latitude/longitude     (optional)
 *   Registered  -> Farmer.createdAt            (optional — preserves the
 *                                                original registration
 *                                                date instead of "now")
 *
 * Any other column in the CSV is reported as unmapped, not silently
 * dropped — add it to the schema first if it's actually needed.
 */
import "dotenv/config";
import {
  getPrismaClient,
  parseArgs,
  findOrgOrExit,
  readCsvRows,
  reportUnmappedColumns,
  validatePhone,
  isPlaceholder,
  parseSheetDate,
  Row,
} from "./lib/csvImportHelpers";

const KNOWN_COLUMNS = new Set(["Name", "Phone", "Village", "Lat", "Lon", "Registered"]);

async function main() {
  const { csvPath, orgSlug, commit } = parseArgs(
    "Usage: npx tsx scripts/importFarmersFromCsv.ts <csv-path> --org=<slug> [--commit]",
  );

  const prisma = getPrismaClient();
  const organization = await findOrgOrExit(prisma, orgSlug);
  const rows = readCsvRows(csvPath);
  reportUnmappedColumns(rows, KNOWN_COLUMNS);

  let importedCount = 0;
  let updatedCount = 0;
  let farmsCreatedCount = 0;
  const skipped: { row: Row; reason: string }[] = [];

  for (const row of rows) {
    const name = (row.Name || "").trim();
    const phoneResult = validatePhone(row.Phone || "");

    if (!name) {
      skipped.push({ row, reason: "missing name" });
      continue;
    }
    if (!phoneResult.ok) {
      skipped.push({ row, reason: phoneResult.reason });
      continue;
    }
    const phone = phoneResult.value;

    const existing = await prisma.farmer.findFirst({
      where: { organizationId: organization.id, phoneNumber: phone },
    });

    if (existing) updatedCount++;
    else importedCount++;

    if (!commit) continue;

    const registeredAt = parseSheetDate(row.Registered || "");
    const farmerId = existing
      ? (await prisma.farmer.update({ where: { id: existing.id }, data: { name } })).id
      : (
          await prisma.farmer.create({
            data: {
              organizationId: organization.id,
              name,
              phoneNumber: phone,
              ...(registeredAt ? { createdAt: registeredAt } : {}),
            },
          })
        ).id;

    const village = (row.Village || "").trim();
    if (!isPlaceholder(village)) {
      const existingFarm = await prisma.farm.findFirst({
        where: { organizationId: organization.id, farmerId, name: village },
      });
      if (!existingFarm) {
        const lat = parseFloat(row.Lat || "");
        const lon = parseFloat(row.Lon || "");
        await prisma.farm.create({
          data: {
            organizationId: organization.id,
            farmerId,
            name: village,
            address: village,
            latitude: isNaN(lat) ? undefined : lat,
            longitude: isNaN(lon) ? undefined : lon,
          },
        });
        farmsCreatedCount++;
      }
    }
  }

  console.log(`${commit ? "COMMITTED" : "DRY RUN — no data written"} — "${csvPath}" -> "${organization.name}" (${orgSlug})`);
  console.log(`  ${rows.length} row(s) read`);
  console.log(`  ${importedCount} new farmer(s) ${commit ? "created" : "would be created"}`);
  console.log(`  ${updatedCount} existing farmer(s) ${commit ? "updated" : "would be updated"} (matched by phone)`);
  if (commit) console.log(`  ${farmsCreatedCount} farm(s) created`);
  console.log(`  ${skipped.length} row(s) skipped:`);
  for (const s of skipped) console.log(`    - ${JSON.stringify(s.row)} — ${s.reason}`);
  if (!commit && importedCount + updatedCount > 0) {
    console.log(`\nRe-run with --commit to actually write these ${importedCount + updatedCount} row(s).`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
