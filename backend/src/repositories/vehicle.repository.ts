import { prisma } from "../lib/prisma";

export function listVehicles(organizationId: string) {
  return prisma.vehicle.findMany({
    where: { organizationId },
    include: { primaryDriver: true },
    orderBy: { name: "asc" },
  });
}

export function findVehicleById(organizationId: string, id: string) {
  return prisma.vehicle.findFirst({ where: { id, organizationId }, include: { primaryDriver: true } });
}

export function createVehicle(
  organizationId: string,
  data: { name: string; registrationNumber: string; capacity?: number; primaryDriverId?: string },
) {
  return prisma.vehicle.create({ data: { organizationId, ...data } });
}

export async function updateVehicle(
  organizationId: string,
  id: string,
  data: {
    name?: string;
    registrationNumber?: string;
    capacity?: number;
    primaryDriverId?: string | null;
    status?: "AVAILABLE" | "EN_ROUTE" | "MAINTENANCE" | "INACTIVE";
  },
) {
  const result = await prisma.vehicle.updateMany({ where: { id, organizationId }, data });
  return result.count > 0;
}

export function findVehicleByPrimaryDriverId(organizationId: string, driverId: string) {
  return prisma.vehicle.findFirst({ where: { organizationId, primaryDriverId: driverId } });
}

// Setting a location is naturally idempotent (setting it to the same
// value twice is harmless), so a duplicate driver SMS needs no dedup here
// the way inbound farmer messages do.
export function updateVehicleLocation(
  id: string,
  data: { latitude: number; longitude: number; source: "GPS" | "SMS_REPORTED" },
) {
  return prisma.vehicle.update({
    where: { id },
    data: {
      currentLatitude: data.latitude,
      currentLongitude: data.longitude,
      locationSource: data.source,
      locationUpdatedAt: new Date(),
    },
  });
}

// Candidates for the nearest-truck recommendation: available, with a
// known location (from GPS or a prior SMS reply), and an active driver
// to actually dispatch to.
export function listAvailableVehiclesWithLocation(organizationId: string) {
  return prisma.vehicle.findMany({
    where: {
      organizationId,
      status: "AVAILABLE",
      currentLatitude: { not: null },
      currentLongitude: { not: null },
      primaryDriver: { status: "ACTIVE" },
    },
    include: { primaryDriver: true },
  });
}

// Everyone eligible to be pinged in a broadcast: available, has a driver
// on file to text, regardless of whether we currently know their location.
export function listAvailableVehiclesWithDriver(organizationId: string) {
  return prisma.vehicle.findMany({
    where: { organizationId, status: "AVAILABLE", primaryDriver: { status: "ACTIVE" } },
    include: { primaryDriver: true },
  });
}

export function updateVehicleStatus(organizationId: string, id: string, status: "AVAILABLE" | "EN_ROUTE" | "MAINTENANCE" | "INACTIVE") {
  return prisma.vehicle.updateMany({ where: { id, organizationId }, data: { status } });
}
