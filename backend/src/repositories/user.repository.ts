import { prisma } from "../lib/prisma";

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { organization: true },
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { organization: true },
  });
}

export function listUsersForOrg(organizationId: string) {
  // Explicit select — never let passwordHash reach an API response.
  return prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export function createUser(
  organizationId: string,
  data: { name: string; email: string; role: "OWNER" | "ADMIN" | "DISPATCHER" | "DRIVER"; passwordHash: string },
) {
  return prisma.user.create({ data: { organizationId, ...data } });
}
