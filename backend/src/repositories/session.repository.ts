import { prisma } from "../lib/prisma";

export function createSession(userId: string, tokenHash: string, expiresAt: Date) {
  return prisma.session.create({ data: { userId, tokenHash, expiresAt } });
}

export function findValidSessionByTokenHash(tokenHash: string) {
  return prisma.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    include: {
      user: { include: { organization: true } },
      // Populated only while this session is in "View as" mode — see
      // Session.impersonatingUserId in schema.prisma.
      impersonatingUser: { include: { organization: true } },
    },
  });
}

export function deleteSessionByTokenHash(tokenHash: string) {
  // deleteMany (not delete) so an already-gone/unknown token is a no-op,
  // not an error — logout should always succeed idempotently.
  return prisma.session.deleteMany({ where: { tokenHash } });
}

// tokenHash is unique, so this always affects at most one row. Setting
// it to null is how "return to your account" ends View-as mode.
export function setImpersonatingUser(tokenHash: string, impersonatingUserId: string | null) {
  return prisma.session.updateMany({ where: { tokenHash }, data: { impersonatingUserId } });
}
