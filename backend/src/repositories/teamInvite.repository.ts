import { prisma } from "../lib/prisma";
import type { UserRole } from "@prisma/client";

export function createInvite(
  organizationId: string,
  data: { name: string; email: string; role: UserRole; tokenHash: string; invitedByUserId: string; expiresAt: Date },
) {
  return prisma.teamInvite.create({ data: { organizationId, ...data } });
}

// Used to block re-inviting an email that already has a live invite —
// "live" meaning not yet accepted and not yet expired (an expired or
// already-accepted one shouldn't block a fresh invite).
export function findActiveInviteByOrgAndEmail(organizationId: string, email: string) {
  return prisma.teamInvite.findFirst({
    where: { organizationId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
}

export function findValidInviteByTokenHash(tokenHash: string) {
  return prisma.teamInvite.findFirst({
    where: { tokenHash, acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { organization: true },
  });
}

// Pending = not yet accepted, regardless of expiry — the settings UI
// shows an "expired" badge rather than just hiding it, so an
// OWNER/ADMIN can see it needs revoking and re-sending.
export function listPendingInvitesForOrg(organizationId: string) {
  return prisma.teamInvite.findMany({
    where: { organizationId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export function markInviteAccepted(id: string) {
  return prisma.teamInvite.update({ where: { id }, data: { acceptedAt: new Date() } });
}

export function deleteInvite(organizationId: string, id: string) {
  // deleteMany (not delete) so this stays a tenant-scoped operation —
  // an id from another organization affects zero rows, not an error
  // that leaks whether it exists (CLAUDE.md §22-24).
  return prisma.teamInvite.deleteMany({ where: { id, organizationId } });
}
