/**
 * scripts/importTrucksFromCsv.ts
 *
 * CLAUDE.md §36 — Google Sheets → PostgreSQL migration, Trucks tab.
 * The old prototype combined "driver" and "vehicle" into one row; the
 * new schema splits them (CLAUDE.md §19-20), so each CSV row becomes a
 * Driver AND a Vehicle, linked via Vehicle.primaryDriverId.
 *
 * Run this AFTER importFarmersFromCsv.ts and BEFORE
 * importDispatchLogFromCsv.ts, which looks drivers/vehicles up by the
 * records this script creates.
 *
 * SAFETY MODEL — same as importFarmersFromCsv.ts: dry run by default,
 * --commit to write, idempotent (Driver matched by phone, Vehicle
 * matched by registration number — both re-run safely), never invents
 * data for an invalid/missing required field.
 *
 * USAGE
 *   npx tsx scripts/importTrucksFromCsv.ts <csv-path> --org=<organization-slug> [--commit]
 *
 * COLUMNS RECOGNIZED:
 *   TruckID      -> Vehicle.registrationNumber and Vehicle.name (required)
 *   DriverName   -> Driver.name                                (required)
 *   Phone        -> Driver.phoneNumber                (required, E.164)
 *   Status       -> Vehicle.status ("Available"/"En Route"/"Maintenance")
 *   Lat, Lon     -> Vehicle.currentLatitude/Longitude  (optional; source
 *                                                        recorded as GPS)
 *   LastUpdated  -> Vehicle.locationUpdatedAt          (optional)
 */
import "dotenv/config";
import {
  getPrismaClient,
  parseArgs,
  findOrgOrExit,
  readCsvRows,
  reportUnmappedColumns,
  validatePhone,
  parseSheetDate,
  Row,
} from "./lib/csvImportHelpers";

const KNOWN_COLUMNS = new Set(["TruckID", "DriverName", "Phone", "Status", "Lat", "Lon", "LastUpdated"]);

const STATUS_MAP: Record<string, "AVAILABLE" | "EN_ROUTE" | "MAINTENANCE"> = {
  available: "AVAILABLE",
  "en route": "EN_ROUTE",
  maintenance: "MAINTENANCE",
};

async function main() {
  const { csvPath, orgSlug, commit } = parseArgs(
    "Usage: npx tsx scripts/importTrucksFromCsv.ts <csv-path> --org=<slug> [--commit]",
  );

  const prisma = getPrismaClient();
  const organization = await findOrgOrExit(prisma, orgSlug);
  const rows = readCsvRows(csvPath);
  reportUnmappedColumns(rows, KNOWN_COLUMNS);

  let driversImported = 0;
  let driversUpdated = 0;
  let vehiclesImported = 0;
  let vehiclesUpdated = 0;
  const skipped: { row: Row; reason: string }[] = [];

  for (const row of rows) {
    const truckId = (row.TruckID || "").trim();
    const driverName = (row.DriverName || "").trim();
    const phoneResult = validatePhone(row.Phone || "");

    if (!truckId) {
      skipped.push({ row, reason: "missing TruckID" });
      continue;
    }
    if (!driverName) {
      skipped.push({ row, reason: "missing DriverName" });
      continue;
    }
    if (!phoneResult.ok) {
      skipped.push({ row, reason: phoneResult.reason });
      continue;
    }
    const phone = phoneResult.value;

    const statusKey = (row.Status || "").trim().toLowerCase();
    const status = STATUS_MAP[statusKey];
    if (row.Status && !status) {
      skipped.push({ row, reason: `unrecognized Status ("${row.Status}")` });
      continue;
    }

    const existingDriver = await prisma.driver.findFirst({
      where: { organizationId: organization.id, phoneNumber: phone },
    });
    const existingVehicle = await prisma.vehicle.findFirst({
      where: { organizationId: organization.id, registrationNumber: truckId },
    });

    // primaryDriverId is unique — if this driver already primarily
    // drives a DIFFERENT vehicle than the one this row is about (e.g.
    // one with a different ID scheme, like seed data's "GF-TRK-001" vs.
    // the sheet's bare "TRK-001" for what's likely the same real truck),
    // writing this row would violate that constraint. Surface it instead
    // of crashing — a human needs to decide whether it's actually the
    // same truck. Covers both creating a new vehicle for this driver and
    // re-importing an existing vehicle whose driver has since changed.
    if (existingDriver) {
      const conflictingVehicle = await prisma.vehicle.findFirst({
        where: {
          organizationId: organization.id,
          primaryDriverId: existingDriver.id,
          ...(existingVehicle ? { id: { not: existingVehicle.id } } : {}),
        },
      });
      if (conflictingVehicle) {
        skipped.push({
          row,
          reason: `driver "${driverName}" already primarily drives vehicle "${conflictingVehicle.registrationNumber}" — possibly the same truck under a different ID; resolve manually`,
        });
        continue;
      }
    }

    if (existingDriver) driversUpdated++;
    else driversImported++;
    if (existingVehicle) vehiclesUpdated++;
    else vehiclesImported++;

    if (!commit) continue;

    const driverId = existingDriver
      ? (await prisma.driver.update({ where: { id: existingDriver.id }, data: { name: driverName } })).id
      : (
          await prisma.driver.create({
            data: { organizationId: organization.id, name: driverName, phoneNumber: phone },
          })
        ).id;

    const lat = parseFloat(row.Lat || "");
    const lon = parseFloat(row.Lon || "");
    const lastUpdated = parseSheetDate(row.LastUpdated || "");
    const hasLocation = !isNaN(lat) && !isNaN(lon);

    const vehicleData = {
      name: truckId,
      ...(status ? { status } : {}),
      ...(hasLocation
        ? {
            currentLatitude: lat,
            currentLongitude: lon,
            locationSource: "GPS" as const,
            locationUpdatedAt: lastUpdated ?? new Date(),
          }
        : {}),
    };

    if (existingVehicle) {
      // Always the current row's driver, not just "fill in if unset" —
      // the conflict check above already confirmed this driver isn't
      // claimed by some other vehicle, so it's safe to actually apply a
      // driver change on re-import rather than silently keeping the old one.
      await prisma.vehicle.update({
        where: { id: existingVehicle.id },
        data: { ...vehicleData, primaryDriverId: driverId },
      });
    } else {
      await prisma.vehicle.create({
        data: {
          organizationId: organization.id,
          registrationNumber: truckId,
          primaryDriverId: driverId,
          ...vehicleData,
        },
      });
    }
  }

  console.log(`${commit ? "COMMITTED" : "DRY RUN — no data written"} — "${csvPath}" -> "${organization.name}" (${orgSlug})`);
  console.log(`  ${rows.length} row(s) read`);
  console.log(`  ${driversImported} new driver(s), ${driversUpdated} updated`);
  console.log(`  ${vehiclesImported} new vehicle(s), ${vehiclesUpdated} updated`);
  console.log(`  ${skipped.length} row(s) skipped:`);
  for (const s of skipped) console.log(`    - ${JSON.stringify(s.row)} — ${s.reason}`);
  if (!commit && driversImported + driversUpdated > 0) {
    console.log(`\nRe-run with --commit to actually write these row(s).`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
