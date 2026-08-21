import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { listVehicles, getVehicle, createVehicle, updateVehicle } from "../controllers/vehicle.controller";

export const vehicleRouter = Router();
vehicleRouter.use(requireAuth);

vehicleRouter.get("/", listVehicles);
vehicleRouter.get("/:id", getVehicle);
vehicleRouter.post("/", createVehicle);
vehicleRouter.patch("/:id", updateVehicle);
