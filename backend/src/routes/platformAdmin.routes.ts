import { Router } from "express";
import { requirePlatformAdminAuth } from "../middleware/requirePlatformAdminAuth.middleware";
import { platformAdminLoginRateLimiter } from "../middleware/rateLimit.middleware";
import { postLogin, postLogout, getMe } from "../controllers/platformAdminAuth.controller";
import {
  listOrganizations,
  getStats,
  getOrganization,
  getDrivers,
  getFarmers,
  getDispatchLog,
  createOrganization,
  suspendOrganization,
  activateOrganization,
} from "../controllers/platformAdminOrganization.controller";

// Mounted at /api/platform-admin — entirely separate from /api/auth and
// /api/organizations, which belong to the organization-user realm. No
// signup route here on purpose: platform admins are provisioned via
// scripts/createPlatformAdmin.ts, never self-registered.
export const platformAdminRouter = Router();

platformAdminRouter.post("/auth/login", platformAdminLoginRateLimiter, postLogin);
platformAdminRouter.post("/auth/logout", postLogout);
platformAdminRouter.get("/auth/me", requirePlatformAdminAuth, getMe);

platformAdminRouter.use("/organizations", requirePlatformAdminAuth);
platformAdminRouter.get("/organizations", listOrganizations);
// Must come before /organizations/:id — otherwise Express would match
// "stats" as the :id param and this route would never be reached.
platformAdminRouter.get("/organizations/stats", getStats);
platformAdminRouter.get("/organizations/:id", getOrganization);
platformAdminRouter.get("/organizations/:id/drivers", getDrivers);
platformAdminRouter.get("/organizations/:id/farmers", getFarmers);
platformAdminRouter.get("/organizations/:id/pickups", getDispatchLog);
platformAdminRouter.post("/organizations", createOrganization);
platformAdminRouter.post("/organizations/:id/suspend", suspendOrganization);
platformAdminRouter.post("/organizations/:id/activate", activateOrganization);
