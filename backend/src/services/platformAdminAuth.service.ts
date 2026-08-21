import crypto from "crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { findPlatformAdminByEmail } from "../repositories/platformAdmin.repository";
import {
  createPlatformAdminSession,
  deletePlatformAdminSessionByTokenHash,
  findValidPlatformAdminSessionByTokenHash,
} from "../repositories/platformAdminSession.repository";

// Deliberately separate from auth.service.ts's token helpers, even
// though the algorithm is identical — this realm must never accidentally
// share state (e.g. a token generated here being validated against the
// org-user Session table) with organization-user auth.
function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function login(email: string, password: string) {
  const admin = await findPlatformAdminByEmail(email);
  if (!admin) return null;

  const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
  if (!passwordMatches) return null;

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + env.platformAdminSessionTtlMs);
  await createPlatformAdminSession(admin.id, hashToken(rawToken), expiresAt);

  return { rawToken, expiresAt, admin };
}

export async function logout(rawToken: string) {
  await deletePlatformAdminSessionByTokenHash(hashToken(rawToken));
}

export async function getAdminForToken(rawToken: string) {
  const session = await findValidPlatformAdminSessionByTokenHash(hashToken(rawToken));
  return session?.platformAdmin ?? null;
}
