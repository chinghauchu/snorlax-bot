import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createAgent,
  health,
  listAgents,
  listMessages,
  sendMessage,
} from "./api";
import type { Agent, ChatMessage, Health, ImageIn } from "./types";

const URL_KEY = "snorlax.runtimeUrl";
const TOKEN_KEY = "snorlax.token";

type Session = { baseUrl: string; token: string };

export function App() {
  const [urlInput, setUrlInput] = useState(
    () =>
      import.meta.env.SNORLAX_URL ??
      localStorage.getItem(URL_KEY) ??
      "http://127.0.0.1:8787",
  );
  const [tokenInput, setTokenInput] = useState(
    () => import.meta.env.SNORLAX_TOKEN ?? localStorage.getItem(TOKEN_KEY) ?? "",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [healthInfo, setHealthInfo] = useState<Health | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [pendingFile, setPendingFile] = useState<ImageIn | null>(null);
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
      const info = await health(next.baseUrl);
      localStorage.setItem(URL_KEY, next.baseUrl);
      localStorage.setItem(TOKEN_KEY, next.token);
      setSession(next);
      setHealthInfo(info);
      const roster = await listAgents(next);
      setAgents(roster);
      const seed =
        roster.find((a) => a.id === "snorlax-bot")?.id ?? roster[0]?.id ?? null;
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
    if (!session) return;
    const agent = await createAgent(
      session,
      newName.trim() || "New agent",
      "Assistant",
      newDescription,
    );
    setAgents((prev) => [...prev, agent]);
    setNewName("");
    setNewDescription("");
    setCreating(false);
    await selectAgent(agent.id);
  }

  async function onSend() {
    if (!session || !active || busy) return;
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    setComposerError(null);
    const images = pendingFile ? [pendingFile] : [];
    setPendingFile(null);
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      agentId: active.id,
      role: "user",
      content,
      images: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    try {
      await sendMessage(session, active.id, content, images, {
        onDelta(messageId, delta) {
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === messageId);
            if (!existing) {
              return [
                ...prev,
                {
                  id: messageId,
                  agentId: active.id,
                  role: "assistant",
                  content: delta,
                  images: [],
                  createdAt: new Date().toISOString(),
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
        onError(message) {
          setComposerError(message);
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
    const data = await fileToBase64(file);
    setPendingFile({
      mime: file.type || "application/octet-stream",
      data,
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
            Named agents on your DGX Spark. Inference stays on the box. Use{" "}
            <code>SNORLAX_URL</code> and <code>SNORLAX_TOKEN</code>, or paste
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
              {healthInfo?.name} v{healthInfo?.version}
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
            />
            <textarea
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
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
                  <small>{agent.title || agent.id}</small>
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
                <p>{active.title || "Message like a coworker. v0 is chat-only."}</p>
              </div>
              <code className="pill">{active.id}</code>
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
                    {message.images.map((img) => (
                      <span key={img.id} className="chip">
                        {img.mime}
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
                    {pendingFile.mime}
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
  const first = parts[0]?.[0] ?? "?";
  return (first + (parts[1]?.[0] ?? "")).toUpperCase();
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
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
