import { Request, Response } from "express";
import * as dispatchService from "../services/dispatch.service";
import { assignPickupSchema } from "../validators/dispatch.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function getRecommendation(req: Request, res: Response) {
  const result = await dispatchService.getRecommendation(req.user!.organizationId, idParam(req));
  if (result === null) return notFound(res, "Pickup request");
  res.json(result);
}

export async function postBroadcast(req: Request, res: Response) {
  const result = await dispatchService.broadcastToDrivers(req.user!.organizationId, idParam(req));
  if (result === null) return notFound(res, "Pickup request");
  res.json(result);
}

export async function postAssign(req: Request, res: Response) {
  const parsed = assignPickupSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "driverId and vehicleId are required");

  const assignment = await dispatchService.assignPickup(
    req.user!.organizationId,
    idParam(req),
    parsed.data.driverId,
    parsed.data.vehicleId,
  );
  if (assignment === null) return notFound(res, "Pickup request");
  res.status(201).json({ assignment });
}
