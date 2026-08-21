import { apiFetch } from "../../lib/apiClient";
import type { Conversation, Message } from "../../types/api";

export function listConversations() {
  return apiFetch<{ conversations: Conversation[] }>("/api/conversations").then((r) => r.conversations);
}

export function listMessages(conversationId: string) {
  return apiFetch<{ messages: Message[] }>(`/api/conversations/${conversationId}/messages`).then(
    (r) => r.messages,
  );
}

export function sendMessage(conversationId: string, body: string) {
  return apiFetch<{ message: Message }>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  }).then((r) => r.message);
}
