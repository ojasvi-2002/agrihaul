import { Request, Response } from "express";
import * as driverService from "../services/driver.service";
import { createDriverSchema, updateDriverSchema } from "../validators/driver.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listDrivers(req: Request, res: Response) {
  const drivers = await driverService.listDrivers(req.user!.organizationId);
  res.json({ drivers });
}

export async function getDriver(req: Request, res: Response) {
  const driver = await driverService.getDriver(req.user!.organizationId, idParam(req));
  if (!driver) return notFound(res, "Driver");
  res.json({ driver });
}

export async function createDriver(req: Request, res: Response) {
  const parsed = createDriverSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid driver data");

  const driver = await driverService.createDriver(req.user!.organizationId, parsed.data);
  res.status(201).json({ driver });
}

export async function updateDriver(req: Request, res: Response) {
  const parsed = updateDriverSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid driver data");

  const updated = await driverService.updateDriver(req.user!.organizationId, idParam(req), parsed.data);
  if (!updated) return notFound(res, "Driver");

  const driver = await driverService.getDriver(req.user!.organizationId, idParam(req));
  res.json({ driver });
}
