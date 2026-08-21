import * as driverRepo from "../repositories/driver.repository";

export const listDrivers = driverRepo.listDrivers;
export const getDriver = driverRepo.findDriverById;
export const createDriver = driverRepo.createDriver;
export const updateDriver = driverRepo.updateDriver;
