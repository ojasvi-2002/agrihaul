import { prisma } from "../lib/prisma";

export function listMessagesForConversation(organizationId: string, conversationId: string) {
  return prisma.message.findMany({
    where: { organizationId, conversationId },
    orderBy: { createdAt: "asc" },
  });
}

export function findMessageById(organizationId: string, id: string) {
  return prisma.message.findFirst({ where: { id, organizationId } });
}

export function findByProviderMessageId(provider: "TWILIO", providerMessageId: string) {
  return prisma.message.findUnique({
    where: { provider_providerMessageId: { provider, providerMessageId } },
  });
}

export function createInboundMessage(
  organizationId: string,
  conversationId: string,
  data: { sender: string; recipient: string; body: string; providerMessageId: string },
) {
  return prisma.message.create({
    data: {
      organizationId,
      conversationId,
      direction: "INBOUND",
      status: "RECEIVED",
      receivedAt: new Date(),
      ...data,
    },
  });
}

export function updateStatusByProviderMessageId(
  providerMessageId: string,
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "UNDELIVERED" | "RECEIVED",
) {
  return prisma.message.updateMany({
    where: { provider: "TWILIO", providerMessageId },
    data: { status },
  });
}

export function setProviderMessageId(id: string, providerMessageId: string, status: "SENT" | "QUEUED") {
  return prisma.message.update({ where: { id }, data: { providerMessageId, status, sentAt: new Date() } });
}

export function setNeedsReview(id: string, needsReview: boolean) {
  return prisma.message.update({ where: { id }, data: { needsReview } });
}

// Twilio isn't wired up until Phase 6, so this only records the outbound
// message as QUEUED — nothing is actually sent yet.
export function createOutboundMessage(
  organizationId: string,
  conversationId: string,
  data: { body: string; sender: string; recipient: string },
) {
  return prisma.message.create({
    data: {
      organizationId,
      conversationId,
      direction: "OUTBOUND",
      status: "QUEUED",
      ...data,
    },
  });
}
