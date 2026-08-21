import { Request, Response } from "express";
import * as twilioWebhookService from "../services/twilioWebhook.service";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function postIncoming(req: Request, res: Response) {
  const { To, From, Body, MessageSid } = req.body;

  if (!To || !From || !MessageSid) {
    return res.status(400).send("Missing required Twilio fields");
  }

  await twilioWebhookService.handleIncomingSms({
    to: To,
    from: From,
    body: Body || "",
    messageSid: MessageSid,
  });

  // Reply flow goes through the dashboard's REST API, not TwiML — Twilio
  // just needs an acknowledgment, no auto-reply markup.
  res.type("text/xml").send(EMPTY_TWIML);
}

export async function postStatus(req: Request, res: Response) {
  const { MessageSid, MessageStatus } = req.body;

  if (!MessageSid || !MessageStatus) {
    return res.status(400).send("Missing required Twilio fields");
  }

  await twilioWebhookService.handleStatusCallback({
    messageSid: MessageSid,
    messageStatus: MessageStatus,
  });

  res.sendStatus(200);
}
