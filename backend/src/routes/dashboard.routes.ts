import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getStats } from "../controllers/dashboard.controller";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/stats", getStats);
