import { Request, Response } from "express";
import * as platformAdminOrgService from "../services/platformAdminOrganization.service";
import { createOrganizationSchema } from "../validators/platformAdminOrganization.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listOrganizations(req: Request, res: Response) {
  const organizations = await platformAdminOrgService.listOrganizations();
  res.json({ organizations });
}

export async function getStats(req: Request, res: Response) {
  const stats = await platformAdminOrgService.getPlatformStats();
  res.json({ stats });
}

export async function getOrganization(req: Request, res: Response) {
  const organization = await platformAdminOrgService.getOrganization(idParam(req));
  if (!organization) return notFound(res, "Organization");
  res.json({ organization });
}

export async function getDrivers(req: Request, res: Response) {
  const drivers = await platformAdminOrgService.getOrganizationDrivers(idParam(req));
  if (drivers === null) return notFound(res, "Organization");
  res.json({ drivers });
}

export async function getFarmers(req: Request, res: Response) {
  const farmers = await platformAdminOrgService.getOrganizationFarmers(idParam(req));
  if (farmers === null) return notFound(res, "Organization");
  res.json({ farmers });
}

export async function getDispatchLog(req: Request, res: Response) {
  const pickups = await platformAdminOrgService.getOrganizationDispatchLog(idParam(req));
  if (pickups === null) return notFound(res, "Organization");
  res.json({ pickups });
}

export async function createOrganization(req: Request, res: Response) {
  const parsed = createOrganizationSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid organization data");

  const { organization } = await platformAdminOrgService.createOrganization(parsed.data);
  res.status(201).json({ organization });
}

export async function suspendOrganization(req: Request, res: Response) {
  const updated = await platformAdminOrgService.suspendOrganization(idParam(req));
  if (!updated) return notFound(res, "Organization");
  res.json({ ok: true });
}

export async function activateOrganization(req: Request, res: Response) {
  const updated = await platformAdminOrgService.activateOrganization(idParam(req));
  if (!updated) return notFound(res, "Organization");
  res.json({ ok: true });
}
