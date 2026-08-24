import { Request, Response } from "express";
import { env } from "../config/env";
import { loginSchema } from "../validators/auth.validator";
import * as authService from "../services/auth.service";
import { sendError } from "../utils/httpErrors";

const COOKIE_OPTIONS = {
  httpOnly: true,
  signed: true,
  // Frontend and backend deploy to different subdomains (e.g. separate
  // *.onrender.com services) — browsers treat that as a different *site*,
  // not just a different origin, so SameSite=Lax would silently stop the
  // cookie being sent on the frontend's fetch() calls. None+Secure is
  // required for that cross-site case; Lax stays correct (and simpler)
  // for local dev, where frontend/backend share the "localhost" site
  // across different ports.
  sameSite: env.isProduction ? ("none" as const) : ("lax" as const),
  secure: env.isProduction,
};

// Exported so any other flow that logs a user in immediately after
// creating their account (team.controller.ts's acceptInvite) sends back
// the exact same session-cookie-plus-user-and-organization shape,
// instead of each reimplementing it slightly differently.
export function respondWithSession(
  res: Response,
  result: { rawToken: string; expiresAt: Date; user: { id: string; name: string; email: string; role: string; organization: { id: string; name: string; slug: string } } },
  status = 200,
) {
  res.cookie(env.sessionCookieName, result.rawToken, { ...COOKIE_OPTIONS, expires: result.expiresAt });
  res.status(status).json({
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
    },
    organization: {
      id: result.user.organization.id,
      name: result.user.organization.name,
      slug: result.user.organization.slug,
    },
  });
}

export async function postLogin(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid email or password format");

  const result = await authService.login(parsed.data.email, parsed.data.password);
  if (!result) return sendError(res, 401, "Invalid email or password");

  respondWithSession(res, result);
}

export async function postLogout(req: Request, res: Response) {
  const rawToken = req.signedCookies[env.sessionCookieName];
  if (rawToken) {
    await authService.logout(rawToken);
  }
  res.clearCookie(env.sessionCookieName);
  res.status(204).send();
}

export function getMe(req: Request, res: Response) {
  // requireAuth already populated req.user before this handler runs.
  const { organization, ...user } = req.user!;
  res.json({ user, organization });
}
