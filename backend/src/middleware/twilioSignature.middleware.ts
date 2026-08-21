import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { validateTwilioSignature } from "../integrations/twilio/client";

// Confirms a webhook request actually came from Twilio, not a forged POST
// (CLAUDE.md §44 principle 5). Requires app.set("trust proxy", ...) in
// app.ts so req.protocol/req.get("host") are correct behind a real host.
export function requireTwilioSignature(req: Request, res: Response, next: NextFunction) {
  if (!env.twilioAuthToken) {
    // Only reachable in non-production — env.ts throws at startup otherwise.
    console.warn("[twilio] TWILIO_AUTH_TOKEN not set — skipping signature validation (dev only).");
    return next();
  }

  const signature = req.header("X-Twilio-Signature");
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  if (!signature || !validateTwilioSignature(url, req.body, signature)) {
    return res.status(403).send("Invalid Twilio signature");
  }
  next();
}
