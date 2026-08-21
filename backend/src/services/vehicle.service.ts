import * as vehicleRepo from "../repositories/vehicle.repository";
import { findDriverById } from "../repositories/driver.repository";
import { ServiceError } from "../utils/serviceErrors";

export const listVehicles = vehicleRepo.listVehicles;
export const getVehicle = vehicleRepo.findVehicleById;

// primaryDriverId is unique (one vehicle per driver) — check up front for
// a clear 400 instead of letting a raw DB constraint error surface.
async function assertDriverAssignable(organizationId: string, driverId: string | null | undefined, excludeVehicleId?: string) {
  if (!driverId) return;
  const driver = await findDriverById(organizationId, driverId);
  if (!driver) throw new ServiceError(400, "primaryDriverId does not refer to a driver in your organization");

  const existing = await vehicleRepo.findVehicleByPrimaryDriverId(organizationId, driverId);
  if (existing && existing.id !== excludeVehicleId) {
    throw new ServiceError(400, `That driver is already assigned to vehicle "${existing.name}"`);
  }
}

export async function createVehicle(
  organizationId: string,
  data: { name: string; registrationNumber: string; capacity?: number; primaryDriverId?: string },
) {
  await assertDriverAssignable(organizationId, data.primaryDriverId);
  return vehicleRepo.createVehicle(organizationId, data);
}

export async function updateVehicle(
  organizationId: string,
  id: string,
  data: Parameters<typeof vehicleRepo.updateVehicle>[2],
) {
  await assertDriverAssignable(organizationId, data.primaryDriverId, id);
  return vehicleRepo.updateVehicle(organizationId, id, data);
}
