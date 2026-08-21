import { Request, Response } from "express";
import * as phoneService from "../services/organizationPhoneNumber.service";
import { createPhoneNumberSchema, updatePhoneNumberSchema } from "../validators/phoneNumber.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listPhoneNumbers(req: Request, res: Response) {
  const phoneNumbers = await phoneService.listPhoneNumbers(req.user!.organizationId);
  res.json({ phoneNumbers });
}

export async function createPhoneNumber(req: Request, res: Response) {
  const parsed = createPhoneNumberSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid phone number data");

  const phoneNumber = await phoneService.createPhoneNumber(req.user!.organizationId, parsed.data);
  res.status(201).json({ phoneNumber });
}

export async function updatePhoneNumber(req: Request, res: Response) {
  const parsed = updatePhoneNumberSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid phone number data");

  const updated = await phoneService.updatePhoneNumber(req.user!.organizationId, idParam(req), parsed.data);
  if (!updated) return notFound(res, "Phone number");

  const phoneNumber = await phoneService.getPhoneNumber(req.user!.organizationId, idParam(req));
  res.json({ phoneNumber });
}
