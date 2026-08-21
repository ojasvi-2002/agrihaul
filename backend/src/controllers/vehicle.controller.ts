import { Request, Response } from "express";
import * as vehicleService from "../services/vehicle.service";
import { createVehicleSchema, updateVehicleSchema } from "../validators/vehicle.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listVehicles(req: Request, res: Response) {
  const vehicles = await vehicleService.listVehicles(req.user!.organizationId);
  res.json({ vehicles });
}

export async function getVehicle(req: Request, res: Response) {
  const vehicle = await vehicleService.getVehicle(req.user!.organizationId, idParam(req));
  if (!vehicle) return notFound(res, "Vehicle");
  res.json({ vehicle });
}

export async function createVehicle(req: Request, res: Response) {
  const parsed = createVehicleSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid vehicle data");

  const vehicle = await vehicleService.createVehicle(req.user!.organizationId, parsed.data);
  res.status(201).json({ vehicle });
}

export async function updateVehicle(req: Request, res: Response) {
  const parsed = updateVehicleSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid vehicle data");

  const updated = await vehicleService.updateVehicle(req.user!.organizationId, idParam(req), parsed.data);
  if (!updated) return notFound(res, "Vehicle");

  const vehicle = await vehicleService.getVehicle(req.user!.organizationId, idParam(req));
  res.json({ vehicle });
}
