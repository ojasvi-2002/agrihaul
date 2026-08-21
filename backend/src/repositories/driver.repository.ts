import { prisma } from "../lib/prisma";

export function listDrivers(organizationId: string) {
  return prisma.driver.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
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
