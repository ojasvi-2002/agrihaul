import { prisma } from "../lib/prisma";

export function listDrivers(organizationId: string) {
  return prisma.driver.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

// Platform-admin view: which vehicle (if any) this driver is the primary
// driver of, so the admin can see the driver-truck pairing at a glance
// without a separate lookup.
export function listDriversForPlatform(organizationId: string) {
  return prisma.driver.findMany({
    where: { organizationId },
    include: { primaryVehicle: true },
    orderBy: { name: "asc" },
  });
}

export function findDriverById(organizationId: string, id: string) {
  return prisma.driver.findFirst({ where: { id, organizationId } });
}

export function findDriverByPhone(organizationId: string, phoneNumber: string) {
  return prisma.driver.findFirst({ where: { organizationId, phoneNumber } });
}

export function createDriver(organizationId: string, data: { name: string; phoneNumber: string }) {
  return prisma.driver.create({ data: { organizationId, ...data } });
}

export async function updateDriver(
  organizationId: string,
  id: string,
  data: { name?: string; phoneNumber?: string; status?: "ACTIVE" | "INACTIVE" },
) {
  const result = await prisma.driver.updateMany({ where: { id, organizationId }, data });
  return result.count > 0;
}
