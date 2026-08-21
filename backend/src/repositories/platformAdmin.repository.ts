import { prisma } from "../lib/prisma";

export function findPlatformAdminByEmail(email: string) {
  return prisma.platformAdmin.findUnique({ where: { email } });
}

export function findPlatformAdminById(id: string) {
  return prisma.platformAdmin.findUnique({ where: { id } });
}

export function createPlatformAdmin(data: { name: string; email: string; passwordHash: string }) {
  return prisma.platformAdmin.create({ data });
}
