import bcrypt from "bcryptjs";
import * as orgRepo from "../repositories/organization.repository";
import { findUserByEmail } from "../repositories/user.repository";
import { uniqueSlugFor } from "../utils/slugify";
import { ServiceError } from "../utils/serviceErrors";

export const listOrganizations = orgRepo.listAllOrganizations;
export const getOrganization = orgRepo.findOrganizationByIdForPlatform;

// Reuses the exact same transactional org+owner creation as self-serve
// signup (Phase 12) — a platform admin setting up an org on a customer's
// behalf shouldn't be a different code path from the one that's already
// tested to never leave an orphaned organization.
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
