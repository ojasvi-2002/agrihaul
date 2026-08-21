import * as conversationRepo from "../repositories/conversation.repository";

export const listConversations = conversationRepo.listConversations;
export const getConversation = conversationRepo.findConversationById;
