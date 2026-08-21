import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/requireRole.middleware";
import { listTeam, inviteUser } from "../controllers/team.controller";

export const teamRouter = Router();
teamRouter.use(requireAuth);

teamRouter.get("/", listTeam);
teamRouter.post("/", requireRole("OWNER", "ADMIN"), inviteUser);
