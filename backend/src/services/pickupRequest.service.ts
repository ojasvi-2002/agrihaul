import * as pickupRepo from "../repositories/pickupRequest.repository";
import { findFarmerById } from "../repositories/farmer.repository";
import { findFarmById } from "../repositories/farm.repository";
import { findActiveAssignmentForPickup, updateAssignmentStatus } from "../repositories/assignment.repository";
import { updateVehicleStatus } from "../repositories/vehicle.repository";
import { ServiceError } from "../utils/serviceErrors";

export const listPickupRequests = pickupRepo.listPickupRequests;
export const getPickupRequest = pickupRepo.findPickupRequestById;

export async function createPickupRequest(
  organizationId: string,
  data: {
    farmerId: string;
    farmId?: string;
    product?: string;
    locationText?: string;
    quantity?: number;
    unit?: string;
    requestedPickupDate?: Date;
    notes?: string;
  },
) {
  const farmer = await findFarmerById(organizationId, data.farmerId);
  if (!farmer) {
    throw new ServiceError(400, "farmerId does not refer to a farmer in your organization");
  }
  if (data.farmId) {
    const farm = await findFarmById(organizationId, data.farmId);
    if (!farm || farm.farmerId !== data.farmerId) {
      throw new ServiceError(400, "farmId does not refer to a farm belonging to that farmer");
    }
  }
  return pickupRepo.createPickupRequest(organizationId, data);
}

// Returns `found: false` only when the pickup genuinely doesn't exist in
// this organization (-> 404). `transitioned` tells the caller whether
// *this* call was the one that actually performed a requested
// COMPLETED/CANCELLED transition — false either for a non-status update
// or when the repo's atomic guard shows someone else already completed/
// cancelled it first (a race, or simply calling this twice). Callers that
// fire a side effect only once per real completion (e.g. the driver DONE
// handler's farmer notification) must gate on `transitioned`, not just
// `found` — a lost race is still a successful, idempotent outcome from
// the caller's point of view, just not one that should repeat the side
// effect that already ran the first time.
export async function updatePickupRequest(
  organizationId: string,
  id: string,
  data: Parameters<typeof pickupRepo.updatePickupRequest>[2],
): Promise<{ found: boolean; transitioned: boolean }> {
  const existing = await pickupRepo.findPickupRequestById(organizationId, id);
  if (!existing) return { found: false, transitioned: false };

  if (data.farmId) {
    const farm = await findFarmById(organizationId, data.farmId);
    if (!farm || farm.farmerId !== existing.farmerId) {
      throw new ServiceError(400, "farmId does not refer to a farm belonging to this pickup's farmer");
    }
  }

  const transitioned = await pickupRepo.updatePickupRequest(organizationId, id, data);

  // Freeing the truck back up is part of what "status changes" means for
  // a pickup that has an active assignment — not a separate feature.
  // Only runs for the call that actually won the transition. Checked as
  // `data.status === ...` directly (not a precomputed boolean) so
  // TypeScript narrows data.status to a non-undefined value inside here.
  if (transitioned && (data.status === "COMPLETED" || data.status === "CANCELLED")) {
    const assignment = await findActiveAssignmentForPickup(organizationId, id);
    if (assignment) {
      await updateAssignmentStatus(organizationId, assignment.id, data.status);
      await updateVehicleStatus(organizationId, assignment.vehicleId, "AVAILABLE");
    }
  }

  return { found: true, transitioned };
}
