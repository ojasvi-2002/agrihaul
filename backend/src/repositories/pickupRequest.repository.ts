import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const WITH_DISPLAY_DETAILS = {
  farmer: true,
  farm: true,
  assignments: {
    where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    include: { driver: true, vehicle: true },
  },
} satisfies Prisma.PickupRequestInclude;

export function listPickupRequests(organizationId: string) {
  return prisma.pickupRequest.findMany({
    where: { organizationId },
    include: WITH_DISPLAY_DETAILS,
    orderBy: { createdAt: "desc" },
  });
}

export function findPickupRequestById(organizationId: string, id: string) {
  return prisma.pickupRequest.findFirst({ where: { id, organizationId }, include: WITH_DISPLAY_DETAILS });
}

// Platform-admin dispatch log: unlike WITH_DISPLAY_DETAILS (which only
// shows a pickup's currently-active assignment, for the org-scoped
// dispatch UI), a log needs the *full* assignment history — including
// completed/cancelled ones — so a platform admin can see who actually
// handled a job, not just what's in progress right now.
const WITH_FULL_ASSIGNMENT_HISTORY = {
  farmer: true,
  farm: true,
  assignments: {
    include: { driver: true, vehicle: true },
    orderBy: { assignedAt: "desc" },
  },
} satisfies Prisma.PickupRequestInclude;

export function listPickupRequestsForPlatform(organizationId: string) {
  return prisma.pickupRequest.findMany({
    where: { organizationId },
    include: WITH_FULL_ASSIGNMENT_HISTORY,
    orderBy: { createdAt: "desc" },
  });
}

// Most recent not-yet-confirmed pickup for a farmer — a second parseable
// SMS while one of these is open is treated as a correction, not a new
// request (CLAUDE.md §42's "correction" test case).
export function findPendingPickupForFarmer(organizationId: string, farmerId: string) {
  return prisma.pickupRequest.findFirst({
    where: { organizationId, farmerId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

// Cancellable = hasn't been picked up by a driver yet.
export function findCancellablePickupForFarmer(organizationId: string, farmerId: string) {
  return prisma.pickupRequest.findFirst({
    where: { organizationId, farmerId, status: { in: ["PENDING", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
  });
}

export function createPickupRequest(
  organizationId: string,
  data: {
    farmerId: string;
    farmId?: string;
    sourceConversationId?: string;
    sourceMessageId?: string;
    product?: string;
    locationText?: string;
    quantity?: number;
    unit?: string;
    requestedPickupDate?: Date;
    notes?: string;
  },
) {
  return prisma.pickupRequest.create({ data: { organizationId, ...data } });
}

export async function updatePickupRequest(
  organizationId: string,
  id: string,
  data: {
    farmId?: string;
    sourceConversationId?: string;
    sourceMessageId?: string;
    product?: string;
    locationText?: string;
    quantity?: number;
    unit?: string;
    requestedPickupDate?: Date;
    notes?: string;
    status?: "PENDING" | "CONFIRMED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  },
) {
  const isTerminalTransition = data.status === "COMPLETED" || data.status === "CANCELLED";
  const result = await prisma.pickupRequest.updateMany({
    where: {
      id,
      organizationId,
      // Only complete/cancel from a still-open state — makes a second,
      // concurrent completion attempt (a redelivered driver DONE
      // webhook, a double-click) affect zero rows instead of silently
      // re-running whatever the caller does next (e.g. a duplicate
      // "your pickup is complete" SMS to the farmer).
      ...(isTerminalTransition ? { status: { notIn: ["COMPLETED", "CANCELLED"] } } : {}),
    },
    data,
  });
  return result.count > 0;
}
