import { Request, Response } from "express";
import * as conversationService from "../services/conversation.service";
import * as messageService from "../services/message.service";
import { createMessageSchema } from "../validators/message.validator";
import { sendError, notFound } from "../utils/httpErrors";
import { idParam } from "../utils/params";

export async function listConversations(req: Request, res: Response) {
  const conversations = await conversationService.listConversations(req.user!.organizationId);
  res.json({ conversations });
}

export async function getConversation(req: Request, res: Response) {
  const conversation = await conversationService.getConversation(req.user!.organizationId, idParam(req));
  if (!conversation) return notFound(res, "Conversation");
  res.json({ conversation });
}

export async function listMessages(req: Request, res: Response) {
  const messages = await messageService.listMessagesForConversation(
    req.user!.organizationId,
    idParam(req),
  );
  if (messages === null) return notFound(res, "Conversation");
  res.json({ messages });
}

export async function createMessage(req: Request, res: Response) {
  const parsed = createMessageSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid message data");

  const message = await messageService.createOutboundMessage(
    req.user!.organizationId,
    idParam(req),
    parsed.data.body,
  );
  if (message === null) return notFound(res, "Conversation");
  res.status(201).json({ message });
}
