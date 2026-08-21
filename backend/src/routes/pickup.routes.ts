import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { listPickups, getPickup, createPickup, updatePickup } from "../controllers/pickup.controller";
import { getRecommendation, postBroadcast, postAssign } from "../controllers/dispatch.controller";

export const pickupRouter = Router();
pickupRouter.use(requireAuth);

pickupRouter.get("/", listPickups);
pickupRouter.get("/:id", getPickup);
pickupRouter.post("/", createPickup);
pickupRouter.patch("/:id", updatePickup);

pickupRouter.get("/:id/recommendation", getRecommendation);
pickupRouter.post("/:id/broadcast", postBroadcast);
pickupRouter.post("/:id/assign", postAssign);
