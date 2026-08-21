import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { getUserForToken } from "../services/auth.service";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const rawToken = req.signedCookies[env.sessionCookieName];
  if (!rawToken) {
    return res.status(401).json({ error: { message: "Not authenticated" } });
  }

  const user = await getUserForToken(rawToken);
  if (!user) {
    res.clearCookie(env.sessionCookieName);
    return res.status(401).json({ error: { message: "Session expired or invalid" } });
  }

  // A platform admin's suspension (CLAUDE.md §34) has to actually do
  // something, not just be a label — block access to a suspended org's
  // data rather than merely displaying a status badge.
  if (user.organization.status === "SUSPENDED") {
    return res.status(403).json({ error: { message: "This organization has been suspended" } });
  }

  req.user = {
    id: user.id,
    organizationId: user.organizationId,
    role: user.role,
    name: user.name,
    email: user.email,
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
    },
  };
  next();
}
