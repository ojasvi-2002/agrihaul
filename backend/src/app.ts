import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { ServiceError } from "./utils/serviceErrors";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { organizationRouter } from "./routes/organization.routes";
import { farmerRouter } from "./routes/farmer.routes";
import { farmRouter } from "./routes/farm.routes";
import { conversationRouter } from "./routes/conversation.routes";
import { messageRouter } from "./routes/message.routes";
import { pickupRouter } from "./routes/pickup.routes";
import { driverRouter } from "./routes/driver.routes";
import { vehicleRouter } from "./routes/vehicle.routes";
import { teamRouter } from "./routes/team.routes";
import { platformAdminRouter } from "./routes/platformAdmin.routes";
import { twilioWebhookRouter } from "./routes/twilioWebhook.routes";

export const app = express();

// Needed for req.protocol/req.get("host") to reflect the real public URL
// behind a reverse proxy — the Twilio signature check depends on it.
app.set("trust proxy", true);

app.use(cors({ origin: env.corsOrigin, credentials: true }));

// Mounted before express.json(): Twilio webhooks are form-urlencoded and
// parse their own body inside twilioWebhookRouter, not as JSON.
app.use("/webhooks/twilio", twilioWebhookRouter);

app.use(express.json());
app.use(cookieParser(env.authSecret));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/organizations", organizationRouter);
app.use("/api/farmers", farmerRouter);
app.use("/api/farms", farmRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api/messages", messageRouter);
app.use("/api/pickups", pickupRouter);
app.use("/api/drivers", driverRouter);
app.use("/api/vehicles", vehicleRouter);
app.use("/api/team", teamRouter);
app.use("/api/platform-admin", platformAdminRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: { message: "Not found" } });
});

// Kept last, and typed with all 4 params, so Express recognizes this as
// the error handler rather than another regular middleware.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ServiceError) {
    return res.status(err.status).json({ error: { message: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: { message: "Internal server error" } });
});
