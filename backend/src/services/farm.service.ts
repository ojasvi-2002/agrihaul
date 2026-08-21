import * as farmRepo from "../repositories/farm.repository";
import { findFarmerById } from "../repositories/farmer.repository";
import { ServiceError } from "../utils/serviceErrors";

export const listFarms = farmRepo.listFarms;
export const getFarm = farmRepo.findFarmById;
export const updateFarm = farmRepo.updateFarm;

export async function createFarm(
  organizationId: string,
  data: { farmerId: string; name: string; address?: string; latitude?: number; longitude?: number },
) {
  const farmer = await findFarmerById(organizationId, data.farmerId);
  if (!farmer) {
    throw new ServiceError(400, "farmerId does not refer to a farmer in your organization");
  }
  return farmRepo.createFarm(organizationId, data);
}
