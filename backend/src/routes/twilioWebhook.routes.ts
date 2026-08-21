import { Router } from "express";
import express from "express";
import { requireTwilioSignature } from "../middleware/twilioSignature.middleware";
import { postIncoming, postStatus } from "../controllers/twilioWebhook.controller";

export const twilioWebhookRouter = Router();

// Twilio POSTs application/x-www-form-urlencoded, not JSON — scoped to
// this router only, not applied globally in app.ts.
twilioWebhookRouter.use(express.urlencoded({ extended: false }));
twilioWebhookRouter.use(requireTwilioSignature);

twilioWebhookRouter.post("/incoming", postIncoming);
twilioWebhookRouter.post("/status", postStatus);
