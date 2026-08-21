import { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { sendError } from "../utils/httpErrors";

// Must run after requireAuth. Org-management actions (phone numbers,
// team membership) are OWNER/ADMIN-only — everything else built so far
// stays open to any authenticated role, unchanged.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      return sendError(res, 403, "You do not have permission to do that");
    }
    next();
  };
}
