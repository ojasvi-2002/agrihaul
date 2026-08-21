import { Request, Response } from "express";
import { env } from "../config/env";
import { loginSchema } from "../validators/auth.validator";
import * as platformAdminAuthService from "../services/platformAdminAuth.service";
import { sendError } from "../utils/httpErrors";

const COOKIE_OPTIONS = {
  httpOnly: true,
  signed: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function postLogin(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid email or password format");

  const result = await platformAdminAuthService.login(parsed.data.email, parsed.data.password);
  if (!result) return sendError(res, 401, "Invalid email or password");

  res.cookie(env.platformAdminSessionCookieName, result.rawToken, {
    ...COOKIE_OPTIONS,
    expires: result.expiresAt,
  });
  res.json({ admin: { id: result.admin.id, name: result.admin.name, email: result.admin.email } });
}

export async function postLogout(req: Request, res: Response) {
  const rawToken = req.signedCookies[env.platformAdminSessionCookieName];
  if (rawToken) {
    await platformAdminAuthService.logout(rawToken);
  }
  res.clearCookie(env.platformAdminSessionCookieName);
  res.status(204).send();
}

export function getMe(req: Request, res: Response) {
  res.json({ admin: req.platformAdmin });
}
