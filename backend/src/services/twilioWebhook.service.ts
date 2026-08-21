import { Prisma } from "@prisma/client";
import { findByTwilioNumber } from "../repositories/organizationPhoneNumber.repository";
import { findFarmerByPhone, createFarmer } from "../repositories/farmer.repository";
import { findDriverByPhone } from "../repositories/driver.repository";
import { findOpenConversationForFarmer, createConversation } from "../repositories/conversation.repository";
import {
  findByProviderMessageId,
  createInboundMessage,
  updateStatusByProviderMessageId,
} from "../repositories/message.repository";
import { processIncomingMessage } from "../modules/messageProcessing/processor";
import { handleDriverMessage } from "./dispatch.service";
import { broadcast } from "../modules/realtime/hub";

function isUniqueConstraintError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// CLAUDE.md §26 incoming flow, steps 2-9. Parsing the message body into a
// structured pickup request (steps 9-10) is Phase 7 — this only stores the
// raw message, which must never be lost or altered (§17).
export async function handleIncomingSms(params: { to: string; from: string; body: string; messageSid: string }) {
  const orgPhone = await findByTwilioNumber(params.to);
  if (!orgPhone) {
    console.warn(`[twilio] Incoming SMS to unrecognized number ${params.to} — dropped.`);
    return null;
  }
  const organizationId = orgPhone.organizationId;

  // Drivers text the same number farmers do — route by sender identity.
  // LOC updates are naturally idempotent and DONE is a one-shot status
  // transition, so no dedup/Message row is needed here the way farmer
  // messages require (see dispatch.service.ts's handleDriverMessage).
  const driver = await findDriverByPhone(organizationId, params.from);
  if (driver) {
    await handleDriverMessage(organizationId, driver.id, params.body);
    return null;
  }

  // Idempotency: a retried webhook delivery for a message we already have
  // must not create a duplicate (CLAUDE.md §26).
  const existing = await findByProviderMessageId("TWILIO", params.messageSid);
  if (existing) return existing;

  let farmer = await findFarmerByPhone(organizationId, params.from);
  if (!farmer) {
    try {
      // Name is unknown until Phase 7's parsing (or a dispatcher edits it) —
      // the phone number is an honest placeholder, not invented data (§29).
      farmer = await createFarmer(organizationId, { name: params.from, phoneNumber: params.from });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      farmer = await findFarmerByPhone(organizationId, params.from);
      if (!farmer) throw err;
    }
  }

  let conversation = await findOpenConversationForFarmer(organizationId, farmer.id);
  if (!conversation) {
    conversation = await createConversation(organizationId, farmer.id);
  }

  let message;
  try {
    message = await createInboundMessage(organizationId, conversation.id, {
      sender: params.from,
      recipient: params.to,
      body: params.body,
      providerMessageId: params.messageSid,
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    // Lost the idempotency race — someone else just inserted it, and
    // therefore also already ran it through the processor below.
    return findByProviderMessageId("TWILIO", params.messageSid);
  }

  // Phase 14 — pushes the raw message to any dispatcher with this
  // conversation open, live. Deliberately fires before parsing/pickup
  // creation below: what a dispatcher sees on the Conversations screen
  // is the message itself, not a derived pickup request.
  broadcast(organizationId, "message", { message, conversationId: conversation.id });

  // Only reached for a genuinely new message — never re-run on a
  // duplicate webhook delivery (CLAUDE.md §26: a retry must not create a
  // second pickup request or double-apply a cancellation).
  await processIncomingMessage({
    organizationId,
    farmerId: farmer.id,
    farmerName: farmer.name,
    farmerPhoneNumber: farmer.phoneNumber,
    conversationId: conversation.id,
    messageId: message.id,
    body: params.body,
  });

  return message;
}

const TWILIO_STATUS_MAP: Record<string, "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "UNDELIVERED"> = {
  queued: "QUEUED",
  accepted: "QUEUED",
  sending: "QUEUED",
  sent: "SENT",
  delivered: "DELIVERED",
  failed: "FAILED",
  undelivered: "UNDELIVERED",
};

export async function handleStatusCallback(params: { messageSid: string; messageStatus: string }) {
  const status = TWILIO_STATUS_MAP[params.messageStatus.toLowerCase()];
  if (!status) {
    console.warn(`[twilio] Unrecognized status callback value: ${params.messageStatus}`);
    return;
  }
  await updateStatusByProviderMessageId(params.messageSid, status);
}
