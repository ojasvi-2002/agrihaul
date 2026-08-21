import { prisma } from "../lib/prisma";

export function listFarms(organizationId: string) {
  return prisma.farm.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export function findFarmById(organizationId: string, id: string) {
  return prisma.farm.findFirst({ where: { id, organizationId } });
}

export function listFarmsForFarmer(organizationId: string, farmerId: string) {
  return prisma.farm.findMany({ where: { organizationId, farmerId } });
}

export function createFarm(
  organizationId: string,
  data: { farmerId: string; name: string; address?: string; latitude?: number; longitude?: number },
) {
  return prisma.farm.create({ data: { organizationId, ...data } });
}

export async function updateFarm(
  organizationId: string,
  id: string,
  data: { name?: string; address?: string; latitude?: number; longitude?: number },
) {
  const result = await prisma.farm.updateMany({ where: { id, organizationId }, data });
  return result.count > 0;
}
