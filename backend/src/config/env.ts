import "dotenv/config";

export const env = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  authSecret: process.env.AUTH_SECRET || "",
  sessionCookieName: "agrihaul_session",
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days

  // Deliberately a different cookie from the org-user session above —
  // keeps the two auth realms from ever being confused, even by accident
  // (CLAUDE.md §34: platform admin must not mix with organization admin).
  platformAdminSessionCookieName: "agrihaul_platform_admin_session",
  platformAdminSessionTtlMs: 24 * 60 * 60 * 1000, // 1 day — shorter-lived, higher-privilege session

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  // Public URL this backend is reachable at, e.g. https://api.example.com.
  // Only needed so Twilio can call back /webhooks/twilio/status — omitted
  // in local dev since Twilio can't reach localhost anyway.
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",

  isProduction: process.env.NODE_ENV === "production",
};

if (!env.authSecret) {
  throw new Error("AUTH_SECRET is not set — check backend/.env");
}

// Skipping Twilio webhook signature validation is only acceptable for
// local development against a Twilio account that doesn't exist yet
// (CLAUDE.md §50 cost control). Never allow that in a real deployment.
if (env.isProduction && !env.twilioAuthToken) {
  throw new Error("TWILIO_AUTH_TOKEN is not set — required in production to validate Twilio webhooks");
}
