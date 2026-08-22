import { prisma } from "../lib/prisma";

export function findBySlug(slug: string) {
  return prisma.organization.findUnique({ where: { slug } });
}

export function createOrganization(data: { name: string; slug: string }) {
  return prisma.organization.create({ data });
}

// Signup creates exactly one new tenant boundary and its first user
// together — a transaction so a failure partway through can never leave
// an orphaned Organization with no owner able to log into it.
export function createOrganizationWithOwner(
  orgData: { name: string; slug: string },
  ownerData: { name: string; email: string; passwordHash: string },
) {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: orgData });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: ownerData.name,
        email: ownerData.email,
        role: "OWNER",
        passwordHash: ownerData.passwordHash,
      },
    });
    return { organization, user };
  });
}

export async function updateOrganization(id: string, data: { name?: string }) {
  const result = await prisma.organization.updateMany({ where: { id }, data });
  return result.count > 0;
}

// ── Platform-admin-only: spans every organization, never scoped to one ──

const WITH_PLATFORM_COUNTS = {
  _count: { select: { users: true, farmers: true, pickupRequests: true } },
};

export function listAllOrganizations() {
  return prisma.organization.findMany({
    include: WITH_PLATFORM_COUNTS,
    orderBy: { createdAt: "desc" },
  });
}

// Richer than the list view — real counts across every entity, the full
// team roster, and configured phone numbers. No payments/billing data
// here: that doesn't exist yet (CLAUDE.md §35 — not built until the
// platform has paying customers), so this deliberately doesn't fabricate
// a placeholder for it.
const WITH_PLATFORM_DETAIL = {
  _count: {
    select: {
      users: true,
      farmers: true,
      farms: true,
      drivers: true,
      vehicles: true,
      conversations: true,
      messages: true,
      pickupRequests: true,
    },
  },
  users: {
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
  phoneNumbers: {
    select: { id: true, twilioPhoneNumber: true, friendlyName: true, active: true },
  },
};

export function findOrganizationByIdForPlatform(id: string) {
  return prisma.organization.findUnique({ where: { id }, include: WITH_PLATFORM_DETAIL });
}

// A cheap existence check for the tab endpoints (drivers/farmers/dispatch
// log) — those don't need the full WITH_PLATFORM_DETAIL query, just a
// clear 404 instead of silently returning an empty list for an org id
// that doesn't exist.
export function organizationExists(id: string) {
  return prisma.organization.findUnique({ where: { id }, select: { id: true } });
}

// Most recent inbound-or-outbound message in the org — the simplest
// honest signal of "is anyone actually using this," without inventing a
// more elaborate activity model than CLAUDE.md's message-centric
// platform already implies.
export function findLastActivityForOrg(organizationId: string) {
  return prisma.message.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
}

export async function updateOrganizationStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
  const result = await prisma.organization.updateMany({ where: { id }, data: { status } });
  return result.count > 0;
}

// Platform-wide aggregate — a snapshot of the whole business, not any
// one tenant. Real counts only; no revenue/payments figure since billing
// doesn't exist yet.
export async function getPlatformStats() {
  const [totalOrganizations, activeOrganizations, totalUsers, totalFarmers, totalPickups] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: "ACTIVE" } }),
    prisma.user.count(),
    prisma.farmer.count(),
    prisma.pickupRequest.count(),
  ]);
  return {
    totalOrganizations,
    activeOrganizations,
    suspendedOrganizations: totalOrganizations - activeOrganizations,
    totalUsers,
    totalFarmers,
    totalPickups,
  };
}
