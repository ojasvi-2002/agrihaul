import * as messageRepo from "../repositories/message.repository";
import { findConversationById } from "../repositories/conversation.repository";
import { findActivePhoneNumber } from "../repositories/organizationPhoneNumber.repository";
import { sendSms } from "../integrations/twilio/client";
import { ServiceError } from "../utils/serviceErrors";

export const getMessage = messageRepo.findMessageById;

// Returns null when the conversation doesn't exist (or belongs to another
// organization) — the controller turns that into a 404 without leaking
// which reason applied.
export async function listMessagesForConversation(organizationId: string, conversationId: string) {
  const conversation = await findConversationById(organizationId, conversationId);
  if (!conversation) return null;
  return messageRepo.listMessagesForConversation(organizationId, conversationId);
}

export async function createOutboundMessage(organizationId: string, conversationId: string, body: string) {
  const conversation = await findConversationById(organizationId, conversationId);
  if (!conversation) return null;

  const orgPhone = await findActivePhoneNumber(organizationId);
  if (!orgPhone) {
    throw new ServiceError(400, "Organization has no active phone number configured");
  }

  const message = await messageRepo.createOutboundMessage(organizationId, conversationId, {
    body,
    sender: orgPhone.twilioPhoneNumber,
    recipient: conversation.farmer.phoneNumber,
  });

  // React never calls Twilio directly (§27) — this is the one place the
  // backend actually dispatches an SMS. Failure here doesn't roll back the
  // message row: it's kept as a QUEUED record of the attempt.
  const result = await sendSms(conversation.farmer.phoneNumber, orgPhone.twilioPhoneNumber, body);
  if (result.sent) {
    return messageRepo.setProviderMessageId(message.id, result.sid, "SENT");
  }
  return message;
}
