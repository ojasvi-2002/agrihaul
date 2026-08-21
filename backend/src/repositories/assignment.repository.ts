import { prisma } from "../lib/prisma";

export function findActiveAssignmentForPickup(organizationId: string, pickupRequestId: string) {
  return prisma.assignment.findFirst({
    where: { organizationId, pickupRequestId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
  });
}

// Looked up when a driver texts DONE — which job are they finishing?
export function findActiveAssignmentForDriver(organizationId: string, driverId: string) {
  return prisma.assignment.findFirst({
    where: { organizationId, driverId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    orderBy: { assignedAt: "desc" },
  });
}

export function createAssignment(
  organizationId: string,
  data: { pickupRequestId: string; driverId: string; vehicleId: string },
) {
  return prisma.assignment.create({ data: { organizationId, ...data } });
}

// Claims the pickup and vehicle atomically, inside one transaction, so
// two concurrent assign requests for the same pickup (or the same
// vehicle) can't both succeed. Each conditional updateMany only affects
// a row still in the expected state; if either affects zero rows,
// someone else won the race and this throws, rolling back both claims.
export async function createAssignmentAtomic(
  organizationId: string,
  pickupRequestId: string,
  driverId: string,
  vehicleId: string,
) {
  return prisma.$transaction(async (tx) => {
    const pickupClaim = await tx.pickupRequest.updateMany({
      where: { id: pickupRequestId, organizationId, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "ASSIGNED" },
    });
    if (pickupClaim.count === 0) {
      throw new RaceLostError("This pickup request is no longer available to assign");
    }

    const vehicleClaim = await tx.vehicle.updateMany({
      where: { id: vehicleId, organizationId, status: "AVAILABLE" },
      data: { status: "EN_ROUTE" },
    });
    if (vehicleClaim.count === 0) {
      throw new RaceLostError("That vehicle is no longer available");
    }

    return tx.assignment.create({ data: { organizationId, pickupRequestId, driverId, vehicleId } });
  });
}

// A named error (not ServiceError directly) so the transaction's own
// rollback-on-throw isn't accidentally caught and swallowed by anything
// generic — the service layer translates this to a 409 explicitly.
export class RaceLostError extends Error {}

export function updateAssignmentStatus(
  organizationId: string,
  id: string,
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
) {
  return prisma.assignment.updateMany({
    where: { id, organizationId },
    data: { status, completedAt: status === "COMPLETED" || status === "CANCELLED" ? new Date() : undefined },
  });
}
