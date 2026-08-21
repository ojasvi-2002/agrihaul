import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/requireRole.middleware";
import { getCurrentOrganization, patchCurrentOrganization } from "../controllers/organization.controller";
import {
  listPhoneNumbers,
  createPhoneNumber,
  updatePhoneNumber,
} from "../controllers/organizationPhoneNumber.controller";

export const organizationRouter = Router();
organizationRouter.use(requireAuth);

organizationRouter.get("/current", getCurrentOrganization);
organizationRouter.patch("/current", requireRole("OWNER", "ADMIN"), patchCurrentOrganization);

organizationRouter.get("/current/phone-numbers", listPhoneNumbers);
organizationRouter.post("/current/phone-numbers", requireRole("OWNER", "ADMIN"), createPhoneNumber);
organizationRouter.patch("/current/phone-numbers/:id", requireRole("OWNER", "ADMIN"), updatePhoneNumber);
