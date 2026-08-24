import crypto from "crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { findUserByEmail } from "../repositories/user.repository";
import {
  createSession,
  deleteSessionByTokenHash,
  findValidSessionByTokenHash,
} from "../repositories/session.repository";
import { closeOpenImpersonationLog } from "../repositories/impersonationLog.repository";
import { ServiceError } from "../utils/serviceErrors";

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Exported so impersonation.service.ts can look up/update the caller's
// own session row by its token hash without duplicating this logic.
export function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Exported so other flows that log a user in immediately after creating
// their account (team.service.ts's acceptInvite — the only way an
// organization account gets created now; see signupRequest.service.ts)
// share the exact same token-generation logic rather than each
// reimplementing it.
export async function createSessionFor(userId: string) {
  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + env.sessionTtlMs);
  await createSession(userId, hashToken(rawToken), expiresAt);
  return { rawToken, expiresAt };
}

export async function login(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) return null;

  // Give a clear reason immediately rather than letting them "log in"
  // and then hit a 403 wall on every subsequent request — requireAuth
  // enforces this too (for sessions issued before a suspension), but
  // this is the better first experience.
  if (user.organization.status === "SUSPENDED") {
    throw new ServiceError(403, "This organization has been suspended");
  }

  const { rawToken, expiresAt } = await createSessionFor(user.id);
  return { rawToken, expiresAt, user };
}

export async function logout(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  // An open "View as" log must not be left dangling if the admin logs
  // out entirely (rather than explicitly returning to their own account
  // first) while still impersonating someone.
  const session = await findValidSessionByTokenHash(tokenHash);
  if (session?.impersonatingUserId) {
    await closeOpenImpersonationLog(session.userId, session.impersonatingUserId);
  }
  await deleteSessionByTokenHash(tokenHash);
}

// The session's own owner/tokenHash never changes for View-as mode — it's
// a pure overlay, not a session swap. When impersonatingUser is set, the
// *effective* user for this request is the impersonated employee, while
// `impersonatedBy` surfaces the real admin so requireAuth can expose both.
export async function getSessionContext(rawToken: string) {
  const session = await findValidSessionByTokenHash(hashToken(rawToken));
  if (!session) return null;

  if (session.impersonatingUser) {
    return { user: session.impersonatingUser, impersonatedBy: session.user };
  }
  return { user: session.user, impersonatedBy: null };
}
