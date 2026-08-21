import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  listConversations,
  getConversation,
  listMessages,
  createMessage,
} from "../controllers/conversation.controller";

export const conversationRouter = Router();
conversationRouter.use(requireAuth);

conversationRouter.get("/", listConversations);
conversationRouter.get("/:id", getConversation);
conversationRouter.get("/:id/messages", listMessages);
conversationRouter.post("/:id/messages", createMessage);
