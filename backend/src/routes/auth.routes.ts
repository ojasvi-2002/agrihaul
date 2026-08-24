import { Router } from "express";
import { postLogin, postLogout, getMe } from "../controllers/auth.controller";
import { postStopImpersonation } from "../controllers/impersonation.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { loginRateLimiter } from "../middleware/rateLimit.middleware";

// No /signup here — see signupRequest.routes.ts. Self-serve signup was
// replaced with a platform-admin-approved request flow (2026-08-24).
export const authRouter = Router();

authRouter.post("/login", loginRateLimiter, postLogin);
authRouter.post("/logout", postLogout);
authRouter.get("/me", requireAuth, getMe);
// No requireRole — must stay reachable while impersonating, since the
// effective req.user.role at that point is the target's (DISPATCHER).
authRouter.post("/stop-impersonation", requireAuth, postStopImpersonation);
