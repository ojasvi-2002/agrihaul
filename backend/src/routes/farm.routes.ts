import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { listFarms, getFarm, createFarm, updateFarm } from "../controllers/farm.controller";

export const farmRouter = Router();
farmRouter.use(requireAuth);

farmRouter.get("/", listFarms);
farmRouter.get("/:id", getFarm);
farmRouter.post("/", createFarm);
farmRouter.patch("/:id", updateFarm);
