import bcrypt from "bcryptjs";
import * as orgRepo from "../repositories/organization.repository";
import { findUserByEmail } from "../repositories/user.repository";
import { listDriversForPlatform } from "../repositories/driver.repository";
import { listFarmersForPlatform } from "../repositories/farmer.repository";
import { listPickupRequestsForPlatform } from "../repositories/pickupRequest.repository";
import { uniqueSlugFor } from "../utils/slugify";
import { ServiceError } from "../utils/serviceErrors";

export const listOrganizations = orgRepo.listAllOrganizations;
export const getPlatformStats = orgRepo.getPlatformStats;

export async function getOrganization(id: string) {
  const organization = await orgRepo.findOrganizationByIdForPlatform(id);
  if (!organization) return null;

  const lastActivity = await orgRepo.findLastActivityForOrg(id);
  return { ...organization, lastActivityAt: lastActivity?.createdAt ?? null };
}

// Each of these backs one tab on the org detail page — kept as separate,
// on-demand calls (rather than folding everything into getOrganization)
// so switching tabs doesn't require re-fetching data the admin hasn't
// asked to see yet.
export async function getOrganizationDrivers(id: string) {
  if (!(await orgRepo.organizationExists(id))) return null;
  return listDriversForPlatform(id);
}

export async function getOrganizationFarmers(id: string) {
  if (!(await orgRepo.organizationExists(id))) return null;
  return listFarmersForPlatform(id);
}

export async function getOrganizationDispatchLog(id: string) {
  if (!(await orgRepo.organizationExists(id))) return null;
  return listPickupRequestsForPlatform(id);
}

// A platform admin creating an org directly (trusting themselves, no
// approval loop needed since they *are* the approver) — distinct from
// the public signup-request flow in signupRequest.service.ts, which
// creates the org without a password and invites the owner by email
// instead. Both ultimately share createOrganizationWithOwner's
// transactional org+owner creation where it applies.
export async function createOrganization(data: { organizationName: string; ownerName: string; email: string; password: string }) {
  const existingUser = await findUserByEmail(data.email);
  if (existingUser) {
    throw new ServiceError(400, "A user with this email already exists");
  }

  const slug = await uniqueSlugFor(data.organizationName);
  const passwordHash = await bcrypt.hash(data.password, 10);
  return orgRepo.createOrganizationWithOwner(
    { name: data.organizationName, slug },
    { name: data.ownerName, email: data.email, passwordHash },
  );
}

export const suspendOrganization = (id: string) => orgRepo.updateOrganizationStatus(id, "SUSPENDED");
export const activateOrganization = (id: string) => orgRepo.updateOrganizationStatus(id, "ACTIVE");
