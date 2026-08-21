import { Request, Response } from "express";
import * as organizationService from "../services/organization.service";
import { updateOrganizationSchema } from "../validators/organization.validator";
import { sendError, notFound } from "../utils/httpErrors";

export function getCurrentOrganization(req: Request, res: Response) {
  res.json({ organization: req.user!.organization });
}

export async function patchCurrentOrganization(req: Request, res: Response) {
  const parsed = updateOrganizationSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid organization data");

  const updated = await organizationService.updateOrganization(req.user!.organizationId, parsed.data);
  if (!updated) return notFound(res, "Organization");

  res.json({ organization: { ...req.user!.organization, ...parsed.data } });
}
