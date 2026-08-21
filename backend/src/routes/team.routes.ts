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
