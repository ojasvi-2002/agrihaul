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

// Looser and longer-lived than login — signing up isn't something a
// legitimate user does repeatedly, so a lower ceiling over a longer window
// still leaves room for a dev/demo flow while blocking scripted mass
// organization creation.
export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
