import { Request, Response } from "express";
import * as farmService from "../services/farm.service";
import { createFarmSchema, updateFarmSchema } from "../validators/farm.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listFarms(req: Request, res: Response) {
  const farms = await farmService.listFarms(req.user!.organizationId);
  res.json({ farms });
}

export async function getFarm(req: Request, res: Response) {
  const farm = await farmService.getFarm(req.user!.organizationId, idParam(req));
  if (!farm) return notFound(res, "Farm");
  res.json({ farm });
}

export async function createFarm(req: Request, res: Response) {
  const parsed = createFarmSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid farm data");

  const farm = await farmService.createFarm(req.user!.organizationId, parsed.data);
  res.status(201).json({ farm });
}

export async function updateFarm(req: Request, res: Response) {
  const parsed = updateFarmSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid farm data");

  const updated = await farmService.updateFarm(req.user!.organizationId, idParam(req), parsed.data);
  if (!updated) return notFound(res, "Farm");

  const farm = await farmService.getFarm(req.user!.organizationId, idParam(req));
  res.json({ farm });
}
