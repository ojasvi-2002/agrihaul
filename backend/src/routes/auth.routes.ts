import { Router } from "express";
import { postLogin, postSignup, postLogout, getMe } from "../controllers/auth.controller";
import { postStopImpersonation } from "../controllers/impersonation.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { loginRateLimiter, signupRateLimiter } from "../middleware/rateLimit.middleware";

export const authRouter = Router();

authRouter.post("/signup", signupRateLimiter, postSignup);
authRouter.post("/login", loginRateLimiter, postLogin);
authRouter.post("/logout", postLogout);
authRouter.get("/me", requireAuth, getMe);
// No requireRole — must stay reachable while impersonating, since the
// effective req.user.role at that point is the target's (DISPATCHER).
authRouter.post("/stop-impersonation", requireAuth, postStopImpersonation);
