import { Request, Response } from "express";
import * as farmerService from "../services/farmer.service";
import { createFarmerSchema, updateFarmerSchema } from "../validators/farmer.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listFarmers(req: Request, res: Response) {
  const farmers = await farmerService.listFarmers(req.user!.organizationId);
  res.json({ farmers });
}

export async function getFarmer(req: Request, res: Response) {
  const farmer = await farmerService.getFarmer(req.user!.organizationId, idParam(req));
  if (!farmer) return notFound(res, "Farmer");
  res.json({ farmer });
}

export async function createFarmer(req: Request, res: Response) {
  const parsed = createFarmerSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid farmer data");

  const farmer = await farmerService.createFarmer(req.user!.organizationId, parsed.data);
  res.status(201).json({ farmer });
}

export async function updateFarmer(req: Request, res: Response) {
  const parsed = updateFarmerSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid farmer data");

  const updated = await farmerService.updateFarmer(req.user!.organizationId, idParam(req), parsed.data);
  if (!updated) return notFound(res, "Farmer");

  const farmer = await farmerService.getFarmer(req.user!.organizationId, idParam(req));
  res.json({ farmer });
}
