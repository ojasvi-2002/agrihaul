import crypto from "crypto";
import * as signupRequestRepo from "../repositories/signupRequest.repository";
import * as orgRepo from "../repositories/organization.repository";
import * as teamInviteRepo from "../repositories/teamInvite.repository";
import { findUserByEmail } from "../repositories/user.repository";
import { uniqueSlugFor } from "../utils/slugify";
import { sendEmail } from "../integrations/email/client";
import { env } from "../config/env";
import { ServiceError } from "../utils/serviceErrors";

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}
function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — same as team invites

export const listSignupRequests = signupRequestRepo.listSignupRequests;

// Public — no Organization or User is created here. The developer's
// explicit decision (2026-08-24): every new organization is held for
// platform-admin review before it exists at all, replacing the old
// self-serve /api/auth/signup flow.
export async function submitSignupRequest(data: { organizationName: string; ownerName: string; email: string }) {
  const existingUser = await findUserByEmail(data.email);
  if (existingUser) {
    throw new ServiceError(400, "An account with this email already exists");
  }
  const existingRequest = await signupRequestRepo.findPendingSignupRequestByEmail(data.email);
  if (existingRequest) {
    throw new ServiceError(400, "A request for this email is already pending review");
  }
  return signupRequestRepo.createSignupRequest(data);
}

// Approving creates the real Organization, then invites the requester as
// its OWNER via the exact same email-link-to-set-a-password flow as a
// normal team invite (team.service.ts's acceptInvite) — no separate
// "claim your account" mechanism to build or test.
export async function approveSignupRequest(id: string) {
  const request = await signupRequestRepo.findSignupRequestById(id);
  if (!request) throw new ServiceError(404, "Signup request not found");
  if (request.status !== "PENDING") throw new ServiceError(400, "This request has already been reviewed");

  // Claimed BEFORE any side effect runs — a concurrent second approval
  // attempt for the same request loses here, not after already creating
  // a second, duplicate organization.
  const claimed = await signupRequestRepo.claimSignupRequest(id, "APPROVED");
  if (claimed.count === 0) {
    throw new ServiceError(409, "This request was already reviewed");
  }

  const slug = await uniqueSlugFor(request.organizationName);
  const organization = await orgRepo.createOrganization({ name: request.organizationName, slug });
  await signupRequestRepo.setCreatedOrganization(id, organization.id);

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await teamInviteRepo.createInvite(organization.id, {
    name: request.ownerName,
    email: request.email,
    role: "OWNER",
    tokenHash: hashToken(rawToken),
    invitedByUserId: null,
    expiresAt,
  });

  const acceptUrl = `${env.corsOrigin}/accept-invite?token=${rawToken}`;
  await sendEmail(
    request.email,
    "Your AgriHaul organization has been approved",
    `Your request to create "${request.organizationName}" on AgriHaul has been approved.\n\n` +
      `Set up your account: ${acceptUrl}\n\nThis link expires in 7 days.`,
  );

  return organization;
}

export async function rejectSignupRequest(id: string) {
  const request = await signupRequestRepo.findSignupRequestById(id);
  if (!request) throw new ServiceError(404, "Signup request not found");
  if (request.status !== "PENDING") throw new ServiceError(400, "This request has already been reviewed");

  const claimed = await signupRequestRepo.claimSignupRequest(id, "REJECTED");
  if (claimed.count === 0) {
    throw new ServiceError(409, "This request was already reviewed");
  }

  await sendEmail(
    request.email,
    "Your AgriHaul signup request",
    `Thanks for your interest in AgriHaul. Your request to create "${request.organizationName}" wasn't approved at this time.`,
  );
}
