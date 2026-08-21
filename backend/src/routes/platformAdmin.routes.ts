import { Router } from "express";
import { requirePlatformAdminAuth } from "../middleware/requirePlatformAdminAuth.middleware";
import { postLogin, postLogout, getMe } from "../controllers/platformAdminAuth.controller";
import {
  listOrganizations,
  getOrganization,
  createOrganization,
  suspendOrganization,
  activateOrganization,
} from "../controllers/platformAdminOrganization.controller";

// Mounted at /api/platform-admin — entirely separate from /api/auth and
// /api/organizations, which belong to the organization-user realm. No
// signup route here on purpose: platform admins are provisioned via
// scripts/createPlatformAdmin.ts, never self-registered.
export const platformAdminRouter = Router();

platformAdminRouter.post("/auth/login", postLogin);
platformAdminRouter.post("/auth/logout", postLogout);
platformAdminRouter.get("/auth/me", requirePlatformAdminAuth, getMe);

platformAdminRouter.use("/organizations", requirePlatformAdminAuth);
platformAdminRouter.get("/organizations", listOrganizations);
platformAdminRouter.get("/organizations/:id", getOrganization);
platformAdminRouter.post("/organizations", createOrganization);
platformAdminRouter.post("/organizations/:id/suspend", suspendOrganization);
platformAdminRouter.post("/organizations/:id/activate", activateOrganization);
