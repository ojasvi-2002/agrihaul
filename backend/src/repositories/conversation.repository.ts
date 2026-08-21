import { prisma } from "../lib/prisma";

export function listConversations(organizationId: string) {
  return prisma.conversation.findMany({
    where: { organizationId },
    include: { farmer: true },
    orderBy: { updatedAt: "desc" },
  });
}

export function findConversationById(organizationId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { id, organizationId },
    include: { farmer: true },
  });
}

export function findOpenConversationForFarmer(organizationId: string, farmerId: string) {
  return prisma.conversation.findFirst({ where: { organizationId, farmerId, status: "OPEN" } });
}

export function createConversation(organizationId: string, farmerId: string) {
  return prisma.conversation.create({ data: { organizationId, farmerId } });
}
