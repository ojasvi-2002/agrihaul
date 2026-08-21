import { Request, Response } from "express";
import * as pickupService from "../services/pickupRequest.service";
import { createPickupRequestSchema, updatePickupRequestSchema } from "../validators/pickup.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listPickups(req: Request, res: Response) {
  const pickups = await pickupService.listPickupRequests(req.user!.organizationId);
  res.json({ pickups });
}

export async function getPickup(req: Request, res: Response) {
  const pickup = await pickupService.getPickupRequest(req.user!.organizationId, idParam(req));
  if (!pickup) return notFound(res, "Pickup request");
  res.json({ pickup });
}

export async function createPickup(req: Request, res: Response) {
  const parsed = createPickupRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid pickup request data");

  const pickup = await pickupService.createPickupRequest(req.user!.organizationId, parsed.data);
  res.status(201).json({ pickup });
}

export async function updatePickup(req: Request, res: Response) {
  const parsed = updatePickupRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid pickup request data");

  const result = await pickupService.updatePickupRequest(
    req.user!.organizationId,
    idParam(req),
    parsed.data,
  );
  // `found` is what matters for 404 here — `transitioned` can be false
  // on a no-op (e.g. re-completing an already-completed pickup), which
  // is still a successful response: the pickup exists and is in the
  // requested state, just not because of this particular request.
  if (!result.found) return notFound(res, "Pickup request");

  const pickup = await pickupService.getPickupRequest(req.user!.organizationId, idParam(req));
  res.json({ pickup });
}
