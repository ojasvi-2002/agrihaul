import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { sendError } from "../utils/httpErrors";

// Login and signup are the only unauthenticated, public-facing write
// endpoints in the app — everything else requires a session first. Without
// a limit here, either one is open to brute-forcing passwords or scripting
// mass organization creation (CLAUDE.md §44 principle 3, and the manifest's
// own "before this touches a real customer" checklist).
function handler(req: Request, res: Response) {
  sendError(res, 429, "Too many attempts. Please wait a while before trying again.");
}

// 10 attempts per IP per 15 minutes — enough headroom for a real user who
// mistypes a password a few times, tight enough to make brute-forcing
// impractical. Counts only failed/attempted requests by not skipping any
// outcome, since a successful login shouldn't reset an attacker's budget.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Same raw count as login but over a 4x longer window, so it's actually
// the *stricter* of the two per unit time — appropriate since signing up
// isn't something a legitimate user does repeatedly, unlike mistyping a
// password. Still leaves enough room for a normal dev/demo flow while
// blocking scripted mass organization creation.
export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Stricter than the organization-user login: platform admins are
// provisioned only via scripts/createPlatformAdmin.ts (never self-signup),
// so there are few of them and a legitimate one rarely mistypes a password
// more than once or twice — while a compromised platform-admin account has
// power over every organization on the platform (CLAUDE.md §34), so this
// surface deserves the tightest budget of the three.
export const platformAdminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
