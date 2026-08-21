import * as phoneRepo from "../repositories/organizationPhoneNumber.repository";
import { ServiceError } from "../utils/serviceErrors";

export const listPhoneNumbers = phoneRepo.listPhoneNumbers;
export const updatePhoneNumber = phoneRepo.updatePhoneNumber;
export const getPhoneNumber = phoneRepo.findPhoneNumberById;

export async function createPhoneNumber(
  organizationId: string,
  data: { twilioPhoneNumber: string; friendlyName?: string },
) {
  // twilioPhoneNumber is how the incoming webhook resolves an
  // organization (CLAUDE.md §25) — it must be globally unique, not just
  // unique within this org.
  const existing = await phoneRepo.findByTwilioNumberAnyOrg(data.twilioPhoneNumber);
  if (existing) {
    throw new ServiceError(400, "This phone number is already registered to an organization");
  }
  return phoneRepo.createPhoneNumber(organizationId, { ...data, phoneNumber: data.twilioPhoneNumber });
}
