import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Conversation, Message } from "../../types/api";
import { listConversations, listMessages, sendMessage } from "./conversationsApi";
import { ApiError, API_URL } from "../../lib/apiClient";

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

  // A ref, not state — the SSE handler below is registered once (empty
  // dependency array) and would otherwise see a stale `selectedId` from
  // whatever it was when the effect first ran.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Phase 14 — one persistent connection per open tab, live-pushing any
  // new message (farmer inbound, or a reply from another dispatcher's
  // tab) into the thread if it's the one currently open. Deliberately
  // page-scoped rather than app-wide: nothing else is realtime yet, so a
  // dispatcher not on this page doesn't need the connection open.
  useEffect(() => {
    const source = new EventSource(`${API_URL}/api/realtime/events`, { withCredentials: true });
    source.addEventListener("message", (e: MessageEvent<string>) => {
      const { message, conversationId }: { message: Message; conversationId: string } = JSON.parse(e.data);
      if (conversationId !== selectedIdRef.current) return;
      setMessages((prev) => {
        // The sender's own tab already appended its own outbound message
        // locally (see handleSend below) — this dedupes against that
        // rather than showing it twice when the broadcast echoes back.
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });
    return () => source.close();
  }, []);

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
