import { prisma } from "../lib/prisma";

export function listFarmers(organizationId: string) {
  return prisma.farmer.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export function findFarmerById(organizationId: string, id: string) {
  return prisma.farmer.findFirst({ where: { id, organizationId } });
}

export function findFarmerByPhone(organizationId: string, phoneNumber: string) {
  return prisma.farmer.findFirst({ where: { organizationId, phoneNumber } });
}

export function createFarmer(organizationId: string, data: { name: string; phoneNumber: string }) {
  return prisma.farmer.create({ data: { organizationId, ...data } });
}

// updateMany (not update) so the organizationId filter is enforced by the
// query itself — a caller mistake can't silently reach another tenant's row.
export async function updateFarmer(
  organizationId: string,
  id: string,
  data: { name?: string; phoneNumber?: string },
) {
  const result = await prisma.farmer.updateMany({ where: { id, organizationId }, data });
  return result.count > 0;
}
