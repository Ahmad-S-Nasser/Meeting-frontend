import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../types";

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  className?: string;
}

/** No shadcn/Radix here by design, same as the rest of this SDK - plain markup only. */
export function ChatPanel({ messages, onSend, className }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ color: "var(--cm-text-muted, #9ca3af)", fontSize: 12, textAlign: "center", marginTop: 16 }}>
            No messages yet
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.isLocal ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            {!m.isLocal && (
              <div style={{ fontSize: 11, color: "var(--cm-text-muted, #9ca3af)", marginBottom: 2 }}>{m.name}</div>
            )}
            <div
              style={{
                padding: "6px 10px",
                borderRadius: "var(--cm-radius, 8px)",
                background: m.isLocal ? "var(--cm-accent, #2563eb)" : "var(--cm-tile-bg, #1e1e1e)",
                color: "#fff",
                fontSize: 13,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid var(--cm-border, rgba(255,255,255,0.1))" }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          aria-label="Chat message"
          maxLength={2000}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "6px 10px",
            borderRadius: "var(--cm-radius, 8px)",
            border: "1px solid var(--cm-border, rgba(255,255,255,0.1))",
            background: "var(--cm-tile-bg, #1e1e1e)",
            color: "var(--cm-text, #fff)",
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          style={{
            padding: "6px 12px",
            borderRadius: "var(--cm-radius, 8px)",
            border: "none",
            background: "var(--cm-accent, #2563eb)",
            color: "#fff",
            fontSize: 13,
            cursor: draft.trim() ? "pointer" : "default",
            opacity: draft.trim() ? 1 : 0.5,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
