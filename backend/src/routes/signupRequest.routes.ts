import { Router } from "express";
import { postSignupRequest } from "../controllers/signupRequest.controller";
import { signupRateLimiter } from "../middleware/rateLimit.middleware";

// Public — replaces the old self-serve /api/auth/signup. Submitting here
// creates only an OrganizationSignupRequest, never an Organization/User —
// see signupRequest.service.ts for the platform-admin approval step that
// actually creates the account.
export const signupRequestRouter = Router();

signupRequestRouter.post("/", signupRateLimiter, postSignupRequest);
