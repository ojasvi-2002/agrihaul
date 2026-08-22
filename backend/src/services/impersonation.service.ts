import type { UserRole } from "@prisma/client";
import { hashToken } from "./auth.service";
import { findUserById } from "../repositories/user.repository";
import { findValidSessionByTokenHash, setImpersonatingUser } from "../repositories/session.repository";
import { createImpersonationLog, closeOpenImpersonationLog } from "../repositories/impersonationLog.repository";
import { ServiceError } from "../utils/serviceErrors";

// Only an OWNER/ADMIN can "view as" someone, and only a DISPATCHER can be
// viewed — matches notes.png ("only employees do all the work") and
// keeps admins from using this to sidestep permission checks on each
// other. The organization match is re-verified here rather than trusted
// from the caller, same as every other cross-tenant boundary in this app.
export async function startImpersonation(
  organizationId: string,
  adminUserId: string,
  adminRole: UserRole,
  targetUserId: string,
  rawSessionToken: string,
) {
  if (adminRole !== "OWNER" && adminRole !== "ADMIN") {
    throw new ServiceError(403, "Only an owner or admin can view as another user");
  }
  if (targetUserId === adminUserId) {
    throw new ServiceError(400, "You can't view as yourself");
  }

  const target = await findUserById(targetUserId);
  if (!target || target.organizationId !== organizationId) {
    throw new ServiceError(404, "User not found");
  }
  if (target.role !== "DISPATCHER") {
    throw new ServiceError(403, "You can only view as an employee, not another owner or admin");
  }

  const tokenHash = hashToken(rawSessionToken);
  const session = await findValidSessionByTokenHash(tokenHash);
  if (!session) {
    throw new ServiceError(401, "Session expired");
  }
  if (session.impersonatingUserId) {
    throw new ServiceError(400, "Already viewing as someone else — return to your account first");
  }

  await setImpersonatingUser(tokenHash, targetUserId);
  await createImpersonationLog(organizationId, adminUserId, targetUserId);
}

// A no-op (not an error) when the caller isn't currently impersonating
// anyone — "return to your account" should always safely succeed.
export async function stopImpersonation(rawSessionToken: string) {
  const tokenHash = hashToken(rawSessionToken);
  const session = await findValidSessionByTokenHash(tokenHash);
  if (!session || !session.impersonatingUserId) return;

  await setImpersonatingUser(tokenHash, null);
  await closeOpenImpersonationLog(session.userId, session.impersonatingUserId);
}
