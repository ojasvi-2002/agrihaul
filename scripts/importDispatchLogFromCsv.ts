/**
 * scripts/importDispatchLogFromCsv.ts
 *
 * CLAUDE.md §36 — Google Sheets → PostgreSQL migration, DispatchLog tab.
 * Each row becomes a completed PickupRequest + Assignment pair. Run
 * AFTER importFarmersFromCsv.ts and importTrucksFromCsv.ts — this
 * script only links to farmers/drivers/vehicles that already exist, it
 * never creates one from a bare name (CLAUDE.md §29: a name alone isn't
 * enough to safely invent a Farmer row, since phoneNumber is required
 * and DispatchLog doesn't have it).
 *
 * SAFETY MODEL — same as the other import scripts: dry run by default,
 * --commit to write. Idempotent by content match (same organization +
 * farmer + exact timestamp + weight) rather than an external ID, since
 * the sheet has no dedicated ID column for dispatch rows.
 *
 * USAGE
 *   npx tsx scripts/importDispatchLogFromCsv.ts <csv-path> --org=<organization-slug> [--commit]
 *
 * COLUMNS RECOGNIZED:
 *   Date, Time    -> PickupRequest/Assignment timestamps (required)
 *   Farmer        -> matched by name to an existing Farmer   (required)
 *   Village       -> PickupRequest.locationText, and used to try to
 *                     match one of that farmer's existing Farms
 *   WeightKG      -> PickupRequest.quantity (unit fixed as "KG")
 *   Driver        -> matched by name to an existing Driver   (required)
 *   TruckID       -> matched by registrationNumber to an existing
 *                     Vehicle                                (required)
 *   DistanceKM    -> Assignment.distanceKm
 */
import "dotenv/config";
import {
  getPrismaClient,
  parseArgs,
  findOrgOrExit,
  readCsvRows,
  reportUnmappedColumns,
  isPlaceholder,
  Row,
} from "./lib/csvImportHelpers";

const KNOWN_COLUMNS = new Set(["Date", "Time", "Farmer", "Village", "WeightKG", "Driver", "TruckID", "DistanceKM"]);

function parseDateTime(dateStr: string, timeStr: string): Date | null {
  const d = new Date(`${dateStr.trim()}T${timeStr.trim()}`);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const { csvPath, orgSlug, commit } = parseArgs(
    "Usage: npx tsx scripts/importDispatchLogFromCsv.ts <csv-path> --org=<slug> [--commit]",
  );

  const prisma = getPrismaClient();
  const organization = await findOrgOrExit(prisma, orgSlug);
  const rows = readCsvRows(csvPath);
  reportUnmappedColumns(rows, KNOWN_COLUMNS);

  let importedCount = 0;
  let duplicateCount = 0;
  const skipped: { row: Row; reason: string }[] = [];

  for (const row of rows) {
    const farmerName = (row.Farmer || "").trim();
    const driverName = (row.Driver || "").trim();
    const truckId = (row.TruckID || "").trim();
    const weight = parseFloat(row.WeightKG || "");
    const when = parseDateTime(row.Date || "", row.Time || "");

    if (!farmerName || !driverName || !truckId) {
      skipped.push({ row, reason: "missing Farmer, Driver, or TruckID" });
      continue;
    }
    if (!when) {
      skipped.push({ row, reason: `unparseable Date/Time ("${row.Date} ${row.Time}")` });
      continue;
    }
    if (isNaN(weight)) {
      skipped.push({ row, reason: `WeightKG is not a number ("${row.WeightKG}")` });
      continue;
    }

    const farmer = await prisma.farmer.findFirst({
      where: { organizationId: organization.id, name: { equals: farmerName, mode: "insensitive" } },
    });
    if (!farmer) {
      skipped.push({ row, reason: `no existing farmer named "${farmerName}" — import Farmers.csv first` });
      continue;
    }

    const driver = await prisma.driver.findFirst({
      where: { organizationId: organization.id, name: { equals: driverName, mode: "insensitive" } },
    });
    if (!driver) {
      skipped.push({ row, reason: `no existing driver named "${driverName}" — import Trucks.csv first` });
      continue;
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { organizationId: organization.id, registrationNumber: truckId },
    });
    if (!vehicle) {
      skipped.push({ row, reason: `no existing vehicle with registration "${truckId}" — import Trucks.csv first` });
      continue;
    }

    const duplicate = await prisma.pickupRequest.findFirst({
      where: { organizationId: organization.id, farmerId: farmer.id, quantity: weight, createdAt: when },
    });
    if (duplicate) {
      duplicateCount++;
      continue;
    }
    importedCount++;

    if (!commit) continue;

    const village = (row.Village || "").trim();
    let farmId: string | undefined;
    if (!isPlaceholder(village)) {
      const farm = await prisma.farm.findFirst({
        where: { organizationId: organization.id, farmerId: farmer.id, name: { equals: village, mode: "insensitive" } },
      });
      farmId = farm?.id;
    }

    const distance = parseFloat(row.DistanceKM || "");

    const pickup = await prisma.pickupRequest.create({
      data: {
        organizationId: organization.id,
        farmerId: farmer.id,
        farmId,
        locationText: isPlaceholder(village) ? undefined : village,
        quantity: weight,
        unit: "KG",
        status: "COMPLETED",
        createdAt: when,
      },
    });

    await prisma.assignment.create({
      data: {
        organizationId: organization.id,
        pickupRequestId: pickup.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        status: "COMPLETED",
        assignedAt: when,
        completedAt: when,
        distanceKm: isNaN(distance) ? undefined : distance,
      },
    });
  }

  console.log(`${commit ? "COMMITTED" : "DRY RUN — no data written"} — "${csvPath}" -> "${organization.name}" (${orgSlug})`);
  console.log(`  ${rows.length} row(s) read`);
  console.log(`  ${importedCount} dispatch record(s) ${commit ? "created" : "would be created"} (PickupRequest + Assignment)`);
  console.log(`  ${duplicateCount} row(s) already imported (matched by farmer + timestamp + weight) — skipped`);
  console.log(`  ${skipped.length} row(s) skipped:`);
  for (const s of skipped) console.log(`    - ${JSON.stringify(s.row)} — ${s.reason}`);
  if (!commit && importedCount > 0) {
    console.log(`\nRe-run with --commit to actually write these ${importedCount} row(s).`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
