import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { listFarmers, getFarmer, createFarmer, updateFarmer } from "../controllers/farmer.controller";

export const farmerRouter = Router();
farmerRouter.use(requireAuth);

farmerRouter.get("/", listFarmers);
farmerRouter.get("/:id", getFarmer);
farmerRouter.post("/", createFarmer);
farmerRouter.patch("/:id", updateFarmer);
