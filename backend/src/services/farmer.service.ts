import * as farmerRepo from "../repositories/farmer.repository";

export const listFarmers = farmerRepo.listFarmers;
export const getFarmer = farmerRepo.findFarmerById;
export const createFarmer = farmerRepo.createFarmer;
export const updateFarmer = farmerRepo.updateFarmer;
