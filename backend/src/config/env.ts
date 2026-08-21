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

  // How many reverse-proxy hops in front of this process to trust for
  // X-Forwarded-* headers (Express's `trust proxy` setting). Defaults to
  // 0 — trust nothing, use the raw socket address — which is correct for
  // local dev (no proxy at all) and safe by default everywhere else.
  // Only raise this, to the *exact* number of hops actually in front of
  // the process (typically 1 for a single load balancer/PaaS), when
  // really deployed behind one — trusting more hops than exist lets a
  // client forge X-Forwarded-For and spoof its apparent IP, which
  // defeats the IP-keyed rate limiters in rateLimit.middleware.ts.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS) || 0,

  isProduction: process.env.NODE_ENV === "production",
};

if (!env.authSecret) {
  throw new Error("AUTH_SECRET is not set — check backend/.env");
}

// Skipping Twilio webhook signature validation is only acceptable for
// local development against a Twilio account that doesn't exist yet
// (CLAUDE.md §50 cost control). Never allow that in a real deployment.
// isProduction alone isn't a reliable signal here — a staging host with
// NODE_ENV left unset but a real PUBLIC_BASE_URL (meaning Twilio can
// actually reach it) would otherwise start up fine with signature
// validation silently skipped. "Publicly reachable" is the real
// condition that matters.
if ((env.isProduction || env.publicBaseUrl) && !env.twilioAuthToken) {
  throw new Error(
    "TWILIO_AUTH_TOKEN is not set — required whenever this backend is publicly reachable " +
      "(NODE_ENV=production or PUBLIC_BASE_URL set), so Twilio webhook signatures can be validated",
  );
}
