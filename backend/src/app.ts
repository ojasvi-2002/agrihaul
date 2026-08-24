import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
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
import { realtimeRouter } from "./routes/realtime.routes";
import { dashboardRouter } from "./routes/dashboard.routes";

export const app = express();

// Needed for req.protocol/req.get("host") to reflect the real public URL
// behind a reverse proxy — the Twilio signature check depends on it. Was
// `true` (trust unlimited hops), which let a client forge X-Forwarded-For
// and spoof its apparent IP, defeating the IP-keyed rate limiters below —
// see env.trustProxyHops for the fix and how to configure it correctly
// when actually deployed behind a proxy.
app.set("trust proxy", env.trustProxyHops);

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
app.use("/api/realtime", realtimeRouter);
app.use("/api/dashboard", dashboardRouter);

// Serves the built frontend from this same process/origin when present —
// only true on Render's combined single-service deploy (see render.yaml),
// where the frontend is built into frontend/dist alongside this backend.
// Local dev keeps running the frontend separately via Vite (README §10),
// so frontend/dist won't exist there and this whole block is a no-op.
//
// Serving both from one origin, rather than two separate Render services,
// is a deliberate fix, not a convenience: Safari (and increasingly other
// browsers) blocks cookies set across two different *.onrender.com
// addresses as cross-site tracking, even with SameSite=None — silently
// breaking login. Same-origin sidesteps that entirely.
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Only fall back to the SPA shell for page loads that aren't a
    // known API/webhook path (already handled above if they matched) or
    // a real static asset (already served above if it existed) — a
    // genuinely bad /api/... path should still 404 as JSON, not HTML.
    if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/webhooks/")) {
      return next();
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

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
