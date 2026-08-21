import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import * as userRepo from "../repositories/user.repository";
import * as inviteRepo from "../repositories/teamInvite.repository";
import { createSessionFor } from "./auth.service";
import { sendEmail } from "../integrations/email/client";
import { env } from "../config/env";
import { ServiceError } from "../utils/serviceErrors";

export const listTeam = userRepo.listUsersForOrg;
export const listPendingInvites = inviteRepo.listPendingInvitesForOrg;

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Creates a pending invite and emails the invitee a link to accept it —
// they set their own password there, rather than the inviter setting one
// and sharing it out of band (CLAUDE.md Phase 12's original stopgap,
// replaced now that email sending exists, even in dev-log form).
export async function createInvite(
  organizationId: string,
  inviterUserId: string,
  inviterRole: UserRole,
  data: { name: string; email: string; role: UserRole },
) {
  // Only an OWNER can create another OWNER — otherwise an ADMIN could
  // mint themselves (or an accomplice) full ownership of the org.
  if (data.role === "OWNER" && inviterRole !== "OWNER") {
    throw new ServiceError(403, "Only an owner can grant the owner role");
  }

  const existingUser = await userRepo.findUserByEmail(data.email);
  if (existingUser) {
    throw new ServiceError(400, "A user with this email already exists");
  }

  const existingInvite = await inviteRepo.findActiveInviteByOrgAndEmail(organizationId, data.email);
  if (existingInvite) {
    throw new ServiceError(400, "This email already has a pending invite");
  }

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await inviteRepo.createInvite(organizationId, {
    name: data.name,
    email: data.email,
    role: data.role,
    tokenHash: hashToken(rawToken),
    invitedByUserId: inviterUserId,
    expiresAt,
  });

  const acceptUrl = `${env.corsOrigin}/accept-invite?token=${rawToken}`;
  // A failed/logged-only send (dev mode — see integrations/email/client.ts)
  // doesn't roll back the invite: it's still valid, the developer just
  // has to read the link out of the server console instead of an inbox.
  await sendEmail(
    data.email,
    `You've been invited to join AgriHaul`,
    `You've been invited to join as ${data.role}.\n\nAccept your invite: ${acceptUrl}\n\nThis link expires in 7 days.`,
  );

  // rawToken only exists here, in memory, before it was hashed away for
  // storage — the controller deliberately doesn't forward it in the API
  // response (it whitelists specific fields), but it's included on this
  // return value so tests can complete an accept-invite flow without a
  // real inbox to read the emailed link from.
  return { ...invite, rawToken };
}

export async function revokeInvite(organizationId: string, inviteId: string) {
  const result = await inviteRepo.deleteInvite(organizationId, inviteId);
  return result.count > 0;
}

// Public preview for the accept-invite page — shown before the invitee
// has any session, so it must reveal nothing beyond what the invite link
// itself already implies (name, role, which org). Returns null for an
// invalid/expired/already-accepted token without distinguishing why.
export async function getInvitePreview(rawToken: string) {
  const invite = await inviteRepo.findValidInviteByTokenHash(hashToken(rawToken));
  if (!invite) return null;
  return { name: invite.name, email: invite.email, role: invite.role, organizationName: invite.organization.name };
}

// Turns a pending invite into a real, logged-in User — the invitee is
// the only one who ever knows their own password. Mirrors auth.service's
// signup(): create the account, then log them in immediately.
export async function acceptInvite(rawToken: string, password: string) {
  const invite = await inviteRepo.findValidInviteByTokenHash(hashToken(rawToken));
  if (!invite) {
    throw new ServiceError(400, "This invite link is invalid or has expired");
  }

  const existingUser = await userRepo.findUserByEmail(invite.email);
  if (existingUser) {
    throw new ServiceError(400, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userRepo.createUser(invite.organizationId, {
    name: invite.name,
    email: invite.email,
    role: invite.role,
    passwordHash,
  });
  await inviteRepo.markInviteAccepted(invite.id);

  const { rawToken: sessionToken, expiresAt } = await createSessionFor(user.id);
  return { rawToken: sessionToken, expiresAt, user: { ...user, organization: invite.organization } };
}
