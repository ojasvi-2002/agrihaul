import { prisma } from "../lib/prisma";

export function findActivePhoneNumber(organizationId: string) {
  return prisma.organizationPhoneNumber.findFirst({ where: { organizationId, active: true } });
}

// Twilio's incoming webhook identifies the organization by the SMS
// destination number, never the sender (CLAUDE.md §25).
export function findByTwilioNumber(twilioPhoneNumber: string) {
  return prisma.organizationPhoneNumber.findFirst({ where: { twilioPhoneNumber, active: true } });
}

export function listPhoneNumbers(organizationId: string) {
  return prisma.organizationPhoneNumber.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
}

export function findPhoneNumberById(organizationId: string, id: string) {
  return prisma.organizationPhoneNumber.findFirst({ where: { id, organizationId } });
}

// twilioPhoneNumber is globally unique (it's how the webhook resolves an
// organization) — findByTwilioNumberAnyOrg lets the service give a clear
// "already registered elsewhere" error instead of a raw constraint crash.
export function findByTwilioNumberAnyOrg(twilioPhoneNumber: string) {
  return prisma.organizationPhoneNumber.findFirst({ where: { twilioPhoneNumber } });
}

export function createPhoneNumber(
  organizationId: string,
  data: { phoneNumber: string; twilioPhoneNumber: string; friendlyName?: string },
) {
  return prisma.organizationPhoneNumber.create({ data: { organizationId, ...data } });
}

export async function updatePhoneNumber(
  organizationId: string,
  id: string,
  data: { friendlyName?: string; active?: boolean },
) {
  const result = await prisma.organizationPhoneNumber.updateMany({ where: { id, organizationId }, data });
  return result.count > 0;
}
