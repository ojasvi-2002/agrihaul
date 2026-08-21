import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Conversation, Message } from "../../types/api";
import { listConversations, listMessages, sendMessage } from "./conversationsApi";
import { ApiError } from "../../lib/apiClient";

export function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listConversations()
      .then((convos) => {
        setConversations(convos);
        if (convos.length > 0) setSelectedId(convos[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load conversations"))
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    // A click on a different conversation before this fetch resolves
    // must not let this stale response overwrite the newer selection's
    // messages — `cancelled` guards every state update below on that.
    let cancelled = false;
    setLoadingThread(true);
    listMessages(selectedId)
      .then((msgs) => {
        if (!cancelled) setMessages(msgs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load messages");
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendMessage(selectedId, draft.trim());
      setMessages((prev) => [...prev, message]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="conversations-page">
      <aside className="conversation-list">
        <div className="conversation-list-header">Conversations</div>
        {loadingList && <div className="empty-state">Loading…</div>}
        {!loadingList && conversations.length === 0 && (
          <div className="empty-state">No conversations yet</div>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`conversation-row ${c.id === selectedId ? "active" : ""}`}
            onClick={() => setSelectedId(c.id)}
          >
            <div className="conversation-row-name">{c.farmer.name}</div>
            <div className="conversation-row-phone">{c.farmer.phoneNumber}</div>
          </button>
        ))}
      </aside>

      <section className="conversation-thread">
        {!selected && <div className="empty-state">Select a conversation</div>}

        {selected && (
          <>
            <div className="conversation-thread-header">
              <div className="conversation-thread-name">{selected.farmer.name}</div>
              <div className="conversation-thread-phone">{selected.farmer.phoneNumber}</div>
            </div>

            <div className="message-list">
              {loadingThread && <div className="empty-state">Loading…</div>}
              {!loadingThread &&
                messages.map((m) => (
                  <div key={m.id} className={`message-bubble ${m.direction.toLowerCase()}`}>
                    <div className="message-body">{m.body}</div>
                    <div className="message-meta">
                      {m.direction === "INBOUND" ? selected.farmer.name : "AgriHaul"} ·{" "}
                      {new Date(m.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
            </div>

            <form className="message-composer" onSubmit={handleSend}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                disabled={sending}
              />
              <button type="submit" disabled={sending || !draft.trim()}>
                Send
              </button>
            </form>
          </>
        )}

        {error && <p className="page-error">{error}</p>}
      </section>
    </div>
  );
}
