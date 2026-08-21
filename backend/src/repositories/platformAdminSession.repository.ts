import { prisma } from "../lib/prisma";

export function createPlatformAdminSession(platformAdminId: string, tokenHash: string, expiresAt: Date) {
  return prisma.platformAdminSession.create({ data: { platformAdminId, tokenHash, expiresAt } });
}

export function findValidPlatformAdminSessionByTokenHash(tokenHash: string) {
  return prisma.platformAdminSession.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    include: { platformAdmin: true },
  });
}

export function deletePlatformAdminSessionByTokenHash(tokenHash: string) {
  return prisma.platformAdminSession.deleteMany({ where: { tokenHash } });
}
