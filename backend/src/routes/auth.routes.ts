import { Router } from "express";
import { postLogin, postSignup, postLogout, getMe } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const authRouter = Router();

authRouter.post("/signup", postSignup);
authRouter.post("/login", postLogin);
authRouter.post("/logout", postLogout);
authRouter.get("/me", requireAuth, getMe);
