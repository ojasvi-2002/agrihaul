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

export function findOrganizationByIdForPlatform(id: string) {
  return prisma.organization.findUnique({ where: { id }, include: WITH_PLATFORM_COUNTS });
}

export async function updateOrganizationStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
  const result = await prisma.organization.updateMany({ where: { id }, data: { status } });
  return result.count > 0;
}
