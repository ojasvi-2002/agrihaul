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

export async function updatePickupRequest(
  organizationId: string,
  id: string,
  data: Parameters<typeof pickupRepo.updatePickupRequest>[2],
) {
  if (data.farmId) {
    const existing = await pickupRepo.findPickupRequestById(organizationId, id);
    if (!existing) return false;
    const farm = await findFarmById(organizationId, data.farmId);
    if (!farm || farm.farmerId !== existing.farmerId) {
      throw new ServiceError(400, "farmId does not refer to a farm belonging to this pickup's farmer");
    }
  }

  const updated = await pickupRepo.updatePickupRequest(organizationId, id, data);

  // Freeing the truck back up is part of what "status changes" means for
  // a pickup that has an active assignment — not a separate feature.
  if (updated && (data.status === "COMPLETED" || data.status === "CANCELLED")) {
    const assignment = await findActiveAssignmentForPickup(organizationId, id);
    if (assignment) {
      await updateAssignmentStatus(organizationId, assignment.id, data.status);
      await updateVehicleStatus(organizationId, assignment.vehicleId, "AVAILABLE");
    }
  }

  return updated;
}
