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

// Audit trail view for Settings — newest first, with the admin/target
// names+emails needed to render it without extra lookups. Org-scoped like
// every other list here, so one org can never see another's activity.
export function listImpersonationLogsForOrg(organizationId: string) {
  return prisma.impersonationLog.findMany({
    where: { organizationId },
    include: {
      admin: { select: { id: true, name: true, email: true } },
      target: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startedAt: "desc" },
  });
}
