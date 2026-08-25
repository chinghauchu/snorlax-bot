import {
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  SEED_AGENT_ID,
  SEED_CHANNEL_ID,
  createAgent,
  deleteAgent,
  listAgents,
  listMessages,
  patchAgent,
  resolveMediaUrl,
  sendMessage,
} from "./api";
import {
  USER_SENDER_ID,
  filterCandidates,
  insertMention,
  isTranscriptVisible,
  isUserSender,
  mentionIdsInText,
  mentionTrigger,
  pickedChipNames,
  senderKey,
  splitMentions,
} from "./mentions";
import type {
  Agent,
  ChatMessage,
  ImageIn,
  Session,
  ThemePref,
} from "./types";

const URL_KEY = "snorlax.runtimeUrl";
const TOKEN_KEY = "snorlax.token";
const THEME_KEY = "snorlax.theme";
const ACCENT_KEY = "snorlax.accent";

const URL_PLACEHOLDER = "http://" + "<" + "spark-lan" + ">" + ":8787";
const MISSING_CREDS =
  "Paste your Spark URL and token in Settings to start.";
const PLACEHOLDER_CHANNEL: Agent = {
  id: SEED_CHANNEL_ID,
  name: "Snorlax-Bot",
  title: "Group",
  description: "",
  avatar: null,
  kind: "channel",
  memberIds: [SEED_AGENT_ID],
  createdAt: "",
  updatedAt: "",
};
const PLACEHOLDER_SEED: Agent = {
  id: SEED_AGENT_ID,
  name: "Snorlax-Bot",
  title: "Assistant",
  description: "",
  avatar: null,
  kind: "agent",
  memberIds: [],
  createdAt: "",
  updatedAt: "",
};
const DEFAULT_ACCENT = "#6d8bff";
const ACCENT_SWATCHES = [
  "#6d8bff",
  "#8b7cff",
  "#3dd6c6",
  "#f5a524",
  "#ff6b6b",
  "#f2f2f3",
];

type PendingImage = {
  mime: string;
  data: string;
  previewUrl: string;
};

type ContextMenu = { x: number; y: number; agent: Agent };

function envUrl(): string {
  return (import.meta.env.SNORLAX_URL || import.meta.env.VITE_SNORLAX_URL || "").trim();
}

function envToken(): string {
  return (
    import.meta.env.SNORLAX_TOKEN ||
    import.meta.env.VITE_SNORLAX_TOKEN ||
    ""
  ).trim();
}

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return /127\.0\.0\.1|localhost/i.test(value);
  }
}

function initialUrl(): string {
  const stored = (localStorage.getItem(URL_KEY) ?? "").trim();
  const candidate = stored || envUrl();
  if (!candidate || isLoopbackUrl(candidate)) return "";
  return candidate.replace(/\/$/, "");
}

function initialToken(): string {
  return (localStorage.getItem(TOKEN_KEY) ?? "").trim() || envToken();
}

function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyChrome(pref: ThemePref, accent: string) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(pref);
  root.style.setProperty("--accent", accent);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof TypeError) {
    return "Cannot reach the runtime. Check the Spark URL in Settings.";
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [session, setSession] = useState<Session | null>(() => {
    const baseUrl = initialUrl();
    const token = initialToken();
    return baseUrl && token ? { baseUrl, token } : null;
  });
  const [themePref, setThemePref] = useState<ThemePref>(
    () => (localStorage.getItem(THEME_KEY) as ThemePref) || "system",
  );
  const [accent, setAccent] = useState(
    () => localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT,
  );
  const [showToken, setShowToken] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);

  const [agents, setAgents] = useState<Agent[]>([PLACEHOLDER_CHANNEL, PLACEHOLDER_SEED]);
  const [activeId, setActiveId] = useState<string | null>(SEED_CHANNEL_ID);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const pickedMentions = useRef(new Map<string, string>());
  const pendingCaret = useRef<number | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const [profileName, setProfileName] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const credsReady = session !== null;

  function commitSession(url = urlInput, token = tokenInput) {
    const baseUrl = url.trim().replace(/\/$/, "");
    const tok = token.trim();
    localStorage.setItem(URL_KEY, baseUrl);
    localStorage.setItem(TOKEN_KEY, tok);
    const next = baseUrl && tok ? { baseUrl, token: tok } : null;
    setSession((prev) => {
      if (prev?.baseUrl === next?.baseUrl && prev?.token === next?.token) {
        return prev;
      }
      return next;
    });
  }

  function closeSettings() {
    commitSession();
    setSettingsOpen(false);
  }
  const active = useMemo(
    () => agents.find((a) => a.id === activeId) ?? null,
    [agents, activeId],
  );
  const mentionCandidates = useMemo(() => {
    const people = agents
      .filter((a) => a.kind !== "channel")
      .map((a) => ({ id: a.id, name: a.name, avatar: a.avatar }));
    return filterCandidates(
      people,
      mentionQuery,
      active?.kind === "channel",
    );
  }, [agents, mentionQuery, active]);

  function syncMentionTrigger(value: string, caret: number) {
    const trigger = mentionTrigger(value, caret);
    if (!trigger) {
      setMentionOpen(false);
      return;
    }
    setMentionQuery(trigger.query);
    setMentionIndex(0);
    setMentionOpen(true);
  }

  function pickMention(candidate: { id: string; name: string }) {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const next = insertMention(draft, caret, candidate.name);
    pickedMentions.current.set(candidate.name.toLowerCase(), candidate.id);
    pendingCaret.current = next.caret;
    setDraft(next.text);
    setMentionOpen(false);
  }

  function isProtected(agent: Agent) {
    return agent.id === SEED_AGENT_ID || agent.kind === "channel";
  }
  const composerDisabled = !credsReady || busy;

  useEffect(() => {
    applyChrome(themePref, accent);
    localStorage.setItem(THEME_KEY, themePref);
    localStorage.setItem(ACCENT_KEY, accent);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyChrome(themePref, accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themePref, accent]);

  useEffect(() => {
    localStorage.setItem(URL_KEY, urlInput.trim().replace(/\/$/, ""));
    localStorage.setItem(TOKEN_KEY, tokenInput.trim());
  }, [urlInput, tokenInput]);

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret == null) return;
    pendingCaret.current = null;
    const node = composerRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(caret, caret);
    resizeComposer();
  }, [draft]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".menu")) return;
      setContextMenu(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setPendingDelete(null);
      setProfileOpen(false);
      if (settingsOpen) closeSettings();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen, urlInput, tokenInput]);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const loadRoster = useCallback(
    async (next: Session) => {
      setLoadError(null);
      try {
        const roster = await listAgents(next);
        setAgents(roster);
        const preferred =
          roster.find((a) => a.kind === "channel")?.id ??
          roster.find((a) => a.id === SEED_AGENT_ID)?.id ??
          roster[0]?.id ??
          null;
        setActiveId(preferred);
        if (preferred) {
          setMessages(await listMessages(next, preferred));
          focusComposer();
        } else {
          setMessages([]);
        }
      } catch (err) {
        setAgents([]);
        setActiveId(null);
        setMessages([]);
        setLoadError(describeError(err));
      }
    },
    [focusComposer],
  );

  useEffect(() => {
    if (!session) {
      setAgents([PLACEHOLDER_CHANNEL, PLACEHOLDER_SEED]);
      setActiveId(SEED_CHANNEL_ID);
      setMessages([]);
      setLoadError(null);
      return;
    }
    void loadRoster(session);
  }, [session, loadRoster]);

  async function selectAgent(id: string) {
    setActiveId(id);
    setComposerError(null);
    setProfileOpen(false);
    if (!session) {
      setMessages([]);
      return;
    }
    try {
      setMessages(await listMessages(session, id));
    } catch (err) {
      setMessages([]);
      setComposerError(describeError(err));
    }
    focusComposer();
  }

  async function onCreate() {
    if (!session) return;
    try {
      const agent = await createAgent(session, "New agent");
      setAgents((prev) => [...prev, agent]);
      setActiveId(agent.id);
      setMessages([]);
      setComposerError(null);
      setProfileOpen(false);
      focusComposer();
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  function openProfile() {
    if (!active) return;
    setProfileName(active.name);
    setProfileTitle(active.title);
    setProfileDescription(active.description);
    setProfileAvatar(active.avatar);
    setProfileOpen(true);
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!session || !active) return;
    setProfileSaving(true);
    try {
      const updated = await patchAgent(session, active.id, {
        name: profileName.trim() || active.name,
        title: profileTitle,
        description: profileDescription,
        avatar: profileAvatar,
      });
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setProfileOpen(false);
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setProfileSaving(false);
    }
  }

  async function confirmDelete() {
    if (!session || !pendingDelete) return;
    const doomed = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteAgent(session, doomed.id);
      const roster = agents.filter((a) => a.id !== doomed.id);
      setAgents(roster);
      if (activeId === doomed.id) {
        const seed =
          roster.find((a) => a.kind === "channel")?.id ??
          roster.find((a) => a.id === SEED_AGENT_ID)?.id ??
          roster[0]?.id ??
          null;
        setActiveId(seed);
        setMessages(seed ? await listMessages(session, seed) : []);
      }
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  async function onSend() {
    if (!session || !active || busy) return;
    const content = draft.trim();
    if (!content && !pendingImage) return;
    if (!content) return;
    setDraft("");
    setComposerError(null);
    const images: ImageIn[] = pendingImage
      ? [{ mime: pendingImage.mime, data: pendingImage.data }]
      : [];
    const localImages = pendingImage
      ? [
          {
            id: `local-img-${Date.now()}`,
            mime: pendingImage.mime,
            url: pendingImage.previewUrl,
          },
        ]
      : [];
    setPendingImage(null);
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      agentId: active.id,
      role: "user",
      content,
      images: localImages,
      createdAt: new Date().toISOString(),
      senderId: USER_SENDER_ID,
      senderName: "User",
      senderAvatar: null,
      hop: 0,
      mentions: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    resizeComposer(true);
    const mentionIds = mentionIdsInText(content, pickedMentions.current);
    try {
      await sendMessage(
        session,
        active.id,
        content,
        images,
        {
        onDelta(messageId, delta, sender) {
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
                  senderId: sender?.senderId || active.id,
                  senderName: sender?.senderName || active.name,
                  senderAvatar: sender?.senderAvatar ?? active.avatar,
                  hop: 0,
                  mentions: [],
                },
              ];
            }
            return prev.map((m) =>
              m.id === messageId ? { ...m, content: m.content + delta } : m,
            );
          });
        },
        onDone(message) {
          if (message) {
            setMessages((prev) => {
              const without = prev.filter((m) => m.id !== message.id);
              return [...without, message];
            });
          }
        },
        onError(code, message) {
          setComposerError(`${code}: ${message}`);
        },
        },
        mentionIds,
      );
      setMessages(await listMessages(session, active.id));
      pickedMentions.current.clear();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setComposerError(err.message);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setDraft(content);
      } else {
        setComposerError(describeError(err));
      }
    } finally {
      setBusy(false);
      focusComposer();
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen && mentionCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(mentionCandidates[mentionIndex] ?? mentionCandidates[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSend();
    }
  }

  function resizeComposer(reset = false) {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (!reset) el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function onPickFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const data = await fileToBase64(file);
    const previewUrl = URL.createObjectURL(file);
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { mime: file.type, data, previewUrl };
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setProfileAvatar(await fileToDataUrl(file));
    if (avatarFileRef.current) avatarFileRef.current.value = "";
  }

  function onAgentContext(event: MouseEvent, agent: Agent) {
    if (isProtected(agent)) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, agent });
  }

  function syncComposerScroll() {
    const field = composerRef.current;
    const overlay = highlightRef.current;
    if (!field || !overlay) return;
    overlay.scrollTop = field.scrollTop;
    overlay.scrollLeft = field.scrollLeft;
  }

  const composerChipNames = pickedChipNames(pickedMentions.current);
  const visibleMessages = active
    ? messages.filter((message) => isTranscriptVisible(message, active))
    : messages;

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-head">
          <span className="wordmark">Snorlax-Bot</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="New agent"
            disabled={!credsReady}
            onClick={() => void onCreate()}
          >
            +
          </button>
        </header>
        <ul className="roster">
          {agents.map((agent) => (
            <li key={agent.id}>
              <button
                type="button"
                className={agent.id === activeId ? "row selected" : "row"}
                onClick={() => void selectAgent(agent.id)}
                onContextMenu={(e) => onAgentContext(e, agent)}
              >
                <Avatar
                  src={agent.avatar}
                  name={agent.name}
                  size={28}
                  session={session}
                />
                <span className="row-copy">
                  <span className="row-name">{agent.name}</span>
                  {agent.title ? (
                    <span className="row-title">{agent.title}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="account"
          onClick={() => setSettingsOpen(true)}
        >
          <Avatar src={null} name="Local" size={22} session={null} />
          <span>Local</span>
        </button>
      </aside>

      <main className="chat">
        <header className="chat-head">
          {active ? (
            <button type="button" className="chat-who" onClick={openProfile}>
              <Avatar
                src={active.avatar}
                name={active.name}
                size={24}
                session={session}
              />
              <span>{active.name}</span>
            </button>
          ) : (
            <span className="chat-who muted">Snorlax-Bot</span>
          )}
        </header>

        <div className="transcript" ref={scroller}>
          <div className="transcript-inner">
            {!credsReady ? (
              <p className="transcript-line">{MISSING_CREDS}</p>
            ) : loadError ? (
              <p className="transcript-line error">{loadError}</p>
            ) : (
              visibleMessages.map((message, index) => {
                const prev = visibleMessages[index - 1];
                const mine = isUserSender(message.senderId, message.role);
                const sameSender =
                  prev != null &&
                  senderKey(prev.senderId, prev.role) ===
                    senderKey(message.senderId, message.role);
                const knownNames = [
                  ...agents.filter((a) => a.kind !== "channel").map((a) => a.name),
                  "everyone",
                ];
                return (
                  <article
                    key={message.id}
                    className={`turn ${mine ? "right" : "left"}${sameSender ? " same-sender" : " new-sender"}`}
                  >
                    {!mine && !sameSender ? (
                      <div className="sender-row">
                        <Avatar
                          src={
                            message.senderAvatar ??
                            agents.find((a) => a.id === message.senderId)?.avatar ??
                            null
                          }
                          name={message.senderName || "Agent"}
                          size={20}
                          session={session}
                        />
                        <span className="sender-name">
                          {message.senderName || "Agent"}
                        </span>
                      </div>
                    ) : null}
                    <div className={`bubble ${mine ? "user" : "agent"}`}>
                      {message.images.map((image) => (
                        <AuthedImg
                          key={image.id}
                          className="bubble-image"
                          src={resolveMediaUrl(session?.baseUrl ?? "", image.url)}
                          session={session}
                          alt=""
                        />
                      ))}
                      {message.content ? (
                        <pre>
                          <MentionText
                            text={message.content}
                            knownNames={knownNames}
                          />
                        </pre>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
            {busy ? <p className="typing">…</p> : null}
          </div>
        </div>

        <footer className="composer">
          {pendingImage ? (
            <div className="attach-preview">
              <img src={pendingImage.previewUrl} alt="Attachment preview" />
              <button
                type="button"
                className="icon-btn tiny"
                aria-label="Remove image"
                onClick={() => {
                  URL.revokeObjectURL(pendingImage.previewUrl);
                  setPendingImage(null);
                }}
              >
                ×
              </button>
            </div>
          ) : null}
          {mentionOpen && mentionCandidates.length > 0 ? (
            <ul className="typeahead" role="listbox">
              {mentionCandidates.map((candidate, index) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === mentionIndex}
                    className={index === mentionIndex ? "on" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(candidate);
                    }}
                  >
                    <Avatar
                      src={candidate.avatar}
                      name={candidate.name}
                      size={20}
                      session={session}
                    />
                    <span>{candidate.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="composer-bar">
            <button
              type="button"
              className="icon-btn"
              aria-label="Attach image"
              disabled={composerDisabled}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
            <div className="composer-field">
              <div className="composer-highlight" aria-hidden ref={highlightRef}>
                <MentionText
                  text={draft}
                  knownNames={composerChipNames}
                  chips
                />
              </div>
              <textarea
                ref={composerRef}
                value={draft}
                rows={1}
                disabled={composerDisabled}
                placeholder={
                  active ? `Message ${active.name}` : "Message"
                }
                onChange={(e) => {
                  setDraft(e.target.value);
                  syncMentionTrigger(e.target.value, e.target.selectionStart);
                  resizeComposer();
                  syncComposerScroll();
                }}
                onScroll={syncComposerScroll}
                onKeyUp={(e) =>
                  syncMentionTrigger(e.currentTarget.value, e.currentTarget.selectionStart)
                }
                onClick={(e) =>
                  syncMentionTrigger(e.currentTarget.value, e.currentTarget.selectionStart)
                }
                onKeyDown={onComposerKey}
              />
            </div>
            <button
              type="button"
              className="send"
              aria-label="Send"
              disabled={composerDisabled || !draft.trim() || !active}
              onClick={() => void onSend()}
            >
              <SendIcon />
            </button>
          </div>
          {composerError ? <p className="error under">{composerError}</p> : null}
        </footer>
      </main>

      {profileOpen && active ? (
        <aside className="profile" role="dialog" aria-label="Agent profile">
          <header>
            <h2>Profile</h2>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={() => setProfileOpen(false)}
            >
              ×
            </button>
          </header>
          <form className="profile-form" onSubmit={saveProfile}>
            <button
              type="button"
              className="avatar-edit"
              onClick={() => avatarFileRef.current?.click()}
            >
              <Avatar
                src={profileAvatar}
                name={profileName || active.name}
                size={64}
                session={session}
              />
              <span>Change</span>
            </button>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onPickAvatar(e.target.files?.[0])}
            />
            <label>
              Name
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </label>
            <label>
              Title
              <input
                value={profileTitle}
                onChange={(e) => setProfileTitle(e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={profileDescription}
                onChange={(e) => setProfileDescription(e.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={profileSaving}>
              Save
            </button>
          </form>
        </aside>
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop" onClick={closeSettings}>
          <div
            className="modal"
            role="dialog"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <h2>Settings</h2>
                <p className="section-label">General</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={closeSettings}
              >
                ×
              </button>
            </header>
            <div className="settings">
              <fieldset>
                <legend>Theme</legend>
                <div className="segmented" role="radiogroup" aria-label="Theme">
                  {(["system", "light", "dark"] as ThemePref[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={themePref === value}
                      className={themePref === value ? "on" : ""}
                      onClick={() => setThemePref(value)}
                    >
                      {value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Accent</legend>
                <div className="swatches">
                  {ACCENT_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={accent === color ? "swatch on" : "swatch"}
                      style={{ background: color }}
                      aria-label={`Accent ${color}`}
                      onClick={() => setAccent(color)}
                    />
                  ))}
                  <input
                    type="color"
                    className="swatch-custom"
                    value={accent}
                    aria-label="Custom accent"
                    onChange={(e) => setAccent(e.target.value)}
                  />
                </div>
              </fieldset>
              <label>
                Runtime URL
                <input
                  value={urlInput}
                  placeholder={URL_PLACEHOLDER}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setUrlInput(e.target.value)}
                />
              </label>
              <label>
                Token
                <span className="password-row">
                  <input
                    type={showToken ? "text" : "password"}
                    value={tokenInput}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setShowToken((v) => !v)}
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setPendingDelete(contextMenu.agent);
              setContextMenu(null);
            }}
          >
            Delete…
          </button>
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className="modal-backdrop"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="modal confirm"
            role="dialog"
            aria-label="Confirm delete"
            onClick={(e) => e.stopPropagation()}
          >
            <p>
              Delete {pendingDelete.name}? This removes the agent and its chat.
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => void confirmDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MentionText({
  text,
  knownNames,
  chips = false,
}: {
  text: string;
  knownNames: string[];
  chips?: boolean;
}) {
  const pieces = splitMentions(text, knownNames);
  if (pieces.length === 0) return text ? <>{text}</> : null;
  return (
    <>
      {pieces.map((piece, index) =>
        piece.type === "mention" && piece.resolved ? (
          <span key={index} className={chips ? "mention-chip" : "mention"}>
            {piece.value}
          </span>
        ) : (
          <span key={index}>{piece.value}</span>
        ),
      )}
    </>
  );
}

function Avatar({
  src,
  name,
  size,
  session,
}: {
  src: string | null;
  name: string;
  size: number;
  session: Session | null;
}) {
  const resolved = src
    ? resolveMediaUrl(session?.baseUrl ?? "", src)
    : "";
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {resolved ? (
        <AuthedImg src={resolved} session={session} alt="" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}

function AuthedImg({
  src,
  session,
  alt,
  className,
}: {
  src: string;
  session: Session | null;
  alt: string;
  className?: string;
}) {
  const [out, setOut] = useState(src);

  useEffect(() => {
    if (!src) return;
    if (src.startsWith("data:") || src.startsWith("blob:") || !session) {
      setOut(src);
      return;
    }
    let dead = false;
    let objectUrl = "";
    fetch(src, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        if (dead) return;
        objectUrl = URL.createObjectURL(blob);
        setOut(objectUrl);
      })
      .catch(() => {
        if (!dead) setOut(src);
      });
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, session]);

  return <img className={className} src={out} alt={alt} />;
}

function Paperclip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M2.4 8.75h8.44L7.7 12.9a.75.75 0 0 0 1.1 1.02l5.5-5.9a.75.75 0 0 0 0-1.04l-5.5-5.9A.75.75 0 1 0 7.7 3.1l3.14 3.4H2.4a.75.75 0 0 0 0 1.5Z"
      />
    </svg>
  );
}
