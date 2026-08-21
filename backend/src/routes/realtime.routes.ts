import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { streamEvents } from "../controllers/realtime.controller";

export const realtimeRouter = Router();

realtimeRouter.get("/events", requireAuth, streamEvents);
