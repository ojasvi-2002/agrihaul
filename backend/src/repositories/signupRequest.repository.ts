import { prisma } from "../lib/prisma";
import type { SignupRequestStatus } from "@prisma/client";

export function createSignupRequest(data: { organizationName: string; ownerName: string; email: string }) {
  return prisma.organizationSignupRequest.create({ data });
}

export function findSignupRequestById(id: string) {
  return prisma.organizationSignupRequest.findUnique({ where: { id } });
}

export function findPendingSignupRequestByEmail(email: string) {
  return prisma.organizationSignupRequest.findFirst({ where: { email, status: "PENDING" } });
}

// Pending first, then most recent — the platform admin's queue is
// something to work through, not just a chronological log.
export function listSignupRequests() {
  return prisma.organizationSignupRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

// Atomic claim — only transitions a still-PENDING row, so two concurrent
// approve/reject calls for the same request (two admins racing, or a
// double-click) can't both "win": the second sees count 0. Deliberately
// doesn't touch createdOrganizationId — that's only knowable *after* the
// organization is actually created, which must happen after this claim
// succeeds, not before (see signupRequest.service.ts's approve flow).
export function claimSignupRequest(id: string, status: Extract<SignupRequestStatus, "APPROVED" | "REJECTED">) {
  return prisma.organizationSignupRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status, reviewedAt: new Date() },
  });
}

export function setCreatedOrganization(id: string, organizationId: string) {
  return prisma.organizationSignupRequest.update({
    where: { id },
    data: { createdOrganizationId: organizationId },
  });
}
