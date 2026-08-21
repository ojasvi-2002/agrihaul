import { Router } from "express";
import { postLogin, postSignup, postLogout, getMe } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { loginRateLimiter, signupRateLimiter } from "../middleware/rateLimit.middleware";

export const authRouter = Router();

authRouter.post("/signup", signupRateLimiter, postSignup);
authRouter.post("/login", loginRateLimiter, postLogin);
authRouter.post("/logout", postLogout);
authRouter.get("/me", requireAuth, getMe);
