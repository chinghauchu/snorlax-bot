import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createAgent,
  health,
  listAgents,
  listMessages,
  sendMessage,
} from "./api";
import type { Agent, AttachmentIn, ChatMessage, RuntimeHealth } from "./types";

const URL_KEY = "snorlax.runtimeUrl";
const TOKEN_KEY = "snorlax.token";

type Session = { baseUrl: string; token: string };

export function App() {
  const [urlInput, setUrlInput] = useState(
    () => localStorage.getItem(URL_KEY) ?? "http://127.0.0.1:8787",
  );
  const [tokenInput, setTokenInput] = useState(
    () => localStorage.getItem(TOKEN_KEY) ?? "",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [healthInfo, setHealthInfo] = useState<RuntimeHealth | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [pendingFile, setPendingFile] = useState<AttachmentIn | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => agents.find((a) => a.id === activeId) ?? null,
    [agents, activeId],
  );

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function connect(event?: FormEvent) {
    event?.preventDefault();
    setPairError(null);
    const next: Session = {
      baseUrl: urlInput.replace(/\/$/, ""),
      token: tokenInput.trim(),
    };
    try {
      const info = await health(next);
      localStorage.setItem(URL_KEY, next.baseUrl);
      localStorage.setItem(TOKEN_KEY, next.token);
      setSession(next);
      setHealthInfo(info);
      const roster = await listAgents(next);
      setAgents(roster);
      const seed =
        roster.find((a) => a.id === info.seeded_agent_id)?.id ??
        roster[0]?.id ??
        null;
      setActiveId(seed);
      if (seed) setMessages(await listMessages(next, seed));
    } catch (err) {
      setPairError(describeError(err));
    }
  }

  async function selectAgent(id: string) {
    if (!session) return;
    setActiveId(id);
    setComposerError(null);
    setMessages(await listMessages(session, id));
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!session || !newName.trim()) return;
    const agent = await createAgent(session, newName.trim(), newInstructions);
    setAgents((prev) => [...prev, agent]);
    setNewName("");
    setNewInstructions("");
    setCreating(false);
    await selectAgent(agent.id);
  }

  async function onSend() {
    if (!session || !active || busy) return;
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    setComposerError(null);
    const attachments = pendingFile ? [pendingFile] : [];
    setPendingFile(null);
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      agent_id: active.id,
      role: "user",
      content,
      attachments: attachments.map((a, i) => ({
        id: `local-att-${i}`,
        filename: a.filename,
        media_type: a.media_type,
        sent_to_model: false,
      })),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    try {
      await sendMessage(session, active.id, content, attachments, {
        onDelta(messageId, delta) {
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === messageId);
            if (!existing) {
              return [
                ...prev,
                {
                  id: messageId,
                  agent_id: active.id,
                  role: "assistant",
                  content: delta,
                  attachments: [],
                  created_at: new Date().toISOString(),
                },
              ];
            }
            return prev.map((m) =>
              m.id === messageId ? { ...m, content: m.content + delta } : m,
            );
          });
        },
        onDone() {
          void listMessages(session, active.id).then(setMessages);
        },
        onError(code, message) {
          setComposerError(`${code}: ${message}`);
        },
      });
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSend();
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    const data_base64 = await fileToBase64(file);
    setPendingFile({
      filename: file.name,
      media_type: file.type || "application/octet-stream",
      data_base64,
    });
  }

  if (!session) {
    return (
      <div className="gate">
        <div className="gate-card">
          <Mark />
          <p className="eyebrow">Local teammate runtime</p>
          <h1>Snorlax-Bot</h1>
          <p className="lede">
            Named agents on your DGX Spark. Inference stays on the box. Paste
            the token printed by <code>snorlax-runtime</code>.
          </p>
          <form onSubmit={connect} className="stack">
            <label>
              Runtime URL
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label>
              Bearer token
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                type="password"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {pairError ? <p className="error">{pairError}</p> : null}
            <button type="submit" className="primary">
              Connect on this LAN
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <Mark small />
          <div>
            <strong>Snorlax-Bot</strong>
            <span>
              {healthInfo?.inference_backend === "vllm" ? "vLLM" : "mock"} ·{" "}
              local
            </span>
          </div>
        </div>
        <button className="ghost" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New teammate"}
        </button>
        {creating ? (
          <form className="create" onSubmit={onCreate}>
            <input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <textarea
              placeholder="Instructions (system prompt)"
              value={newInstructions}
              onChange={(e) => setNewInstructions(e.target.value)}
              rows={3}
            />
            <button type="submit" className="primary compact">
              Create
            </button>
          </form>
        ) : null}
        <ul className="roster">
          {agents.map((agent) => (
            <li key={agent.id}>
              <button
                className={agent.id === activeId ? "active" : ""}
                onClick={() => void selectAgent(agent.id)}
              >
                <span className="avatar" aria-hidden>
                  {initials(agent.name)}
                </span>
                <span>
                  <b>{agent.name}</b>
                  <small>{agent.id}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          className="ghost disconnect"
          onClick={() => {
            setSession(null);
            setHealthInfo(null);
          }}
        >
          Disconnect
        </button>
      </aside>
      <main className="stage">
        {active ? (
          <>
            <header className="stage-head">
              <div>
                <h2>{active.name}</h2>
                <p>Message like a coworker. v0 is chat-only — no tools yet.</p>
              </div>
              <code className="pill">{healthInfo?.model.split("/").pop()}</code>
            </header>
            <div className="transcript" ref={scroller}>
              {messages.length === 0 ? (
                <div className="empty">
                  <p>No transcript yet. Hand Snorlax something real.</p>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`bubble ${message.role}`}
                  >
                    <span className="who">
                      {message.role === "user" ? "You" : active.name}
                    </span>
                    <pre>{message.content}</pre>
                    {message.attachments.map((att) => (
                      <span key={att.id} className="chip">
                        {att.filename}
                        <em>not sent to model</em>
                      </span>
                    ))}
                  </article>
                ))
              )}
              {busy ? <p className="typing">streaming…</p> : null}
            </div>
            <footer className="composer">
              {composerError ? <p className="error">{composerError}</p> : null}
              {pendingFile ? (
                <div className="chip-row">
                  <span className="chip">
                    {pendingFile.filename}
                    <em>will persist, not inferred</em>
                  </span>
                  <button
                    type="button"
                    className="ghost compact"
                    onClick={() => setPendingFile(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKey}
                placeholder={`Message ${active.name}…`}
                rows={3}
                disabled={busy}
              />
              <div className="composer-bar">
                <label className="file">
                  Attach
                  <input
                    type="file"
                    onChange={(e) =>
                      void onPickFile(e.target.files?.[0] ?? undefined)
                    }
                  />
                </label>
                <button
                  className="primary"
                  type="button"
                  disabled={busy || !draft.trim()}
                  onClick={() => void onSend()}
                >
                  Send
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="empty">Create a teammate to start.</div>
        )}
      </main>
    </div>
  );
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "mark small" : "mark"} aria-hidden>
      <span className="mark-body" />
      <span className="mark-eye" />
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof TypeError) {
    return "Cannot reach the runtime. Is snorlax-runtime listening?";
  }
  return err instanceof Error ? err.message : "Unknown error";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
