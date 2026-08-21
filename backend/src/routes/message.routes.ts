import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getMessage } from "../controllers/message.controller";

export const messageRouter = Router();
messageRouter.use(requireAuth);

messageRouter.get("/:id", getMessage);
