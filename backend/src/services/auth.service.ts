import crypto from "crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { findUserByEmail } from "../repositories/user.repository";
import { createOrganizationWithOwner } from "../repositories/organization.repository";
import {
  createSession,
  deleteSessionByTokenHash,
  findValidSessionByTokenHash,
} from "../repositories/session.repository";
import { ServiceError } from "../utils/serviceErrors";
import { uniqueSlugFor } from "../utils/slugify";

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Exported so other flows that log a user in immediately after creating
// their account (signup below, and team.service.ts's acceptInvite) share
// the exact same token-generation logic rather than each reimplementing
// it.
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

// CLAUDE.md Phase 12: "Create organization -> Create owner" — the one
// place a brand new tenant boundary gets created. Logs the new owner in
// immediately afterward, same as a normal login.
export async function signup(organizationName: string, ownerName: string, email: string, password: string) {
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new ServiceError(400, "An account with this email already exists");
  }

  const slug = await uniqueSlugFor(organizationName);
  const passwordHash = await bcrypt.hash(password, 10);
  const { organization, user } = await createOrganizationWithOwner(
    { name: organizationName, slug },
    { name: ownerName, email, passwordHash },
  );

  const { rawToken, expiresAt } = await createSessionFor(user.id);
  return { rawToken, expiresAt, user: { ...user, organization } };
}

export async function logout(rawToken: string) {
  await deleteSessionByTokenHash(hashToken(rawToken));
}

export async function getUserForToken(rawToken: string) {
  const session = await findValidSessionByTokenHash(hashToken(rawToken));
  return session?.user ?? null;
}
