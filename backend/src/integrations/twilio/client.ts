import twilio from "twilio";
import { env } from "../../config/env";

const isConfigured = Boolean(env.twilioAccountSid && env.twilioAuthToken);

const client = isConfigured ? twilio(env.twilioAccountSid, env.twilioAuthToken) : null;

export type SendSmsResult =
  | { sent: true; sid: string; status: string }
  | { sent: false; reason: string };

// No-ops (rather than throwing) when Twilio isn't configured, so local dev
// works without a Twilio account (CLAUDE.md §50) — outbound messages just
// stay QUEUED in the database instead of actually dispatching.
export async function sendSms(to: string, from: string, body: string): Promise<SendSmsResult> {
  if (!client) {
    console.warn("[twilio] Not configured — message stays QUEUED, nothing sent.");
    return { sent: false, reason: "Twilio not configured" };
  }

  try {
    const message = await client.messages.create({
      to,
      from,
      body,
      ...(env.publicBaseUrl
        ? { statusCallback: `${env.publicBaseUrl}/webhooks/twilio/status` }
        : {}),
    });
    return { sent: true, sid: message.sid, status: message.status };
  } catch (err) {
    console.error("[twilio] Send failed:", err);
    return { sent: false, reason: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function validateTwilioSignature(url: string, params: Record<string, unknown>, signature: string) {
  return twilio.validateRequest(env.twilioAuthToken, signature, url, params);
}
