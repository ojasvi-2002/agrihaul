import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { listDrivers, getDriver, createDriver, updateDriver } from "../controllers/driver.controller";

export const driverRouter = Router();
driverRouter.use(requireAuth);

driverRouter.get("/", listDrivers);
driverRouter.get("/:id", getDriver);
driverRouter.post("/", createDriver);
driverRouter.patch("/:id", updateDriver);
