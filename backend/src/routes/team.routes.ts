import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/requireRole.middleware";
import {
  listTeam,
  inviteUser,
  listPendingInvites,
  revokeInvite,
  getInvitePreview,
  acceptInvite,
} from "../controllers/team.controller";
import { postStartImpersonation } from "../controllers/impersonation.controller";

export const teamRouter = Router();

// Public — the invitee has no session yet when following an invite link.
// Defined before requireAuth is applied below, since Express middleware
// only gates routes registered after it in the same router.
teamRouter.get("/invites/preview", getInvitePreview);
teamRouter.post("/invites/accept", acceptInvite);

teamRouter.use(requireAuth);

teamRouter.get("/", listTeam);
teamRouter.post("/", requireRole("OWNER", "ADMIN"), inviteUser);
teamRouter.get("/invites", requireRole("OWNER", "ADMIN"), listPendingInvites);
teamRouter.delete("/invites/:id", requireRole("OWNER", "ADMIN"), revokeInvite);

// requireRole here also happens to block nested impersonation: while
// already viewing as someone, req.user.role is the target's (DISPATCHER)
// role, not the real admin's — see impersonation.service.ts for the
// explicit check this backs up.
teamRouter.post("/:id/impersonate", requireRole("OWNER", "ADMIN"), postStartImpersonation);
