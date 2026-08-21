import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { getAdminForToken } from "../services/platformAdminAuth.service";

export async function requirePlatformAdminAuth(req: Request, res: Response, next: NextFunction) {
  const rawToken = req.signedCookies[env.platformAdminSessionCookieName];
  if (!rawToken) {
    return res.status(401).json({ error: { message: "Not authenticated" } });
  }

  const admin = await getAdminForToken(rawToken);
  if (!admin) {
    res.clearCookie(env.platformAdminSessionCookieName);
    return res.status(401).json({ error: { message: "Session expired or invalid" } });
  }

  req.platformAdmin = { id: admin.id, name: admin.name, email: admin.email };
  next();
}
