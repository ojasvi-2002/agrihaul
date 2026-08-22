import { prisma } from "../lib/prisma";

export function createImpersonationLog(organizationId: string, adminUserId: string, targetUserId: string) {
  return prisma.impersonationLog.create({ data: { organizationId, adminUserId, targetUserId } });
}

// Closes the most recent still-open log row for this admin/target pair.
// There should only ever be one open row per admin session at a time
// (starting impersonation is blocked while already impersonating), but
// this is scoped defensively rather than assuming that invariant holds.
export function closeOpenImpersonationLog(adminUserId: string, targetUserId: string) {
  return prisma.impersonationLog.updateMany({
    where: { adminUserId, targetUserId, endedAt: null },
    data: { endedAt: new Date() },
  });
}
