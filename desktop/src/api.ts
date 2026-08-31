import type {
  Agent,
  AgentPatch,
  ChatMessage,
  ImageIn,
  Attachment,
  MessageDelta,
  Plugin,
  PluginAuth,
  PluginCreate,
  PluginCatalogEntry,
  ComputerPreview,
  Routine,
  RoutineCreate,
  RoutinePatch,
  Skill,
  SkillBody,
  SkillPatch,
  AgentMemory,
  MemoryForget,
  RuntimeHealth,
  Session,
} from "./types";

export const SEED_AGENT_ID = "snorlax-bot";
export const SEED_CHANNEL_ID = "snorlax-bot-group";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function headers(session: Session, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Authorization", `Bearer ${session.token}`);
  return h;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Bare arrays are the contract; unwrap a leftover `{ agents|messages: [] }` envelope. */
function asList<T>(body: unknown, wrappedKey: string): T[] {
  if (Array.isArray(body)) return body as T[];
  if (isRecord(body) && Array.isArray(body[wrappedKey])) {
    return body[wrappedKey] as T[];
  }
  return [];
}

function errorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  if (typeof body.error === "string") return body.error;
  if (isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }
  return fallback;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as unknown;
    return new ApiError(
      response.status,
      "error",
      errorMessage(body, response.statusText),
    );
  } catch {
    return new ApiError(response.status, "error", response.statusText);
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}

/** GET /v1/health — no auth. Does not unlock send. */
export async function health(baseUrl: string): Promise<RuntimeHealth> {
  const response = await fetch(`${baseUrl}/v1/health`);
  return json<RuntimeHealth>(response);
}

export async function listAgents(session: Session): Promise<Agent[]> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    headers: headers(session),
  });
  return asList<Agent>(await json<unknown>(response), "agents");
}

export async function createAgent(
  session: Session,
  name = "New agent",
): Promise<Agent> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    method: "POST",
    headers: headers(session, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name }),
  });
  return json<Agent>(response);
}

export async function createChannel(
  session: Session,
  name: string,
  memberIds: string[],
): Promise<Agent> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    method: "POST",
    headers: headers(session, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name, kind: "channel", memberIds }),
  });
  return json<Agent>(response);
}

export async function patchAgent(
  session: Session,
  agentId: string,
  patch: AgentPatch,
): Promise<Agent> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}`,
    {
      method: "PATCH",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    },
  );
  return json<Agent>(response);
}

export async function deleteAgent(
  session: Session,
  agentId: string,
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}`,
    { method: "DELETE", headers: headers(session) },
  );
  if (!response.ok) throw await parseError(response);
}

export async function listRoutines(
  session: Session,
  agentId: string,
): Promise<Routine[]> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/routines`,
    { headers: headers(session) },
  );
  return asList<Routine>(await json<unknown>(response), "routines");
}

export async function patchRoutine(
  session: Session,
  agentId: string,
  routineId: string,
  patch: RoutinePatch,
): Promise<Routine> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(routineId)}`,
    {
      method: "PATCH",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    },
  );
  return json<Routine>(response);
}

export async function createRoutine(
  session: Session,
  agentId: string,
  body: RoutineCreate,
): Promise<Routine> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/routines`,
    {
      method: "POST",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
  );
  return json<Routine>(response);
}

export async function deleteRoutine(
  session: Session,
  agentId: string,
  routineId: string,
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(routineId)}`,
    { method: "DELETE", headers: headers(session) },
  );
  if (!response.ok) throw await parseError(response);
}

export async function listSkills(
  session: Session,
  agentId: string,
): Promise<Skill[]> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/skills`,
    { headers: headers(session) },
  );
  return asList<Skill>(await json<unknown>(response), "skills");
}

export async function getSkill(
  session: Session,
  agentId: string,
  skillId: string,
): Promise<SkillBody> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
    { headers: headers(session) },
  );
  return json<SkillBody>(response);
}

export async function patchSkill(
  session: Session,
  agentId: string,
  skillId: string,
  patch: SkillPatch,
): Promise<SkillBody> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
    {
      method: "PATCH",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    },
  );
  return json<SkillBody>(response);
}

export async function deleteSkill(
  session: Session,
  agentId: string,
  skillId: string,
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
    { method: "DELETE", headers: headers(session) },
  );
  if (!response.ok) throw await parseError(response);
}

export async function getMemory(
  session: Session,
  agentId: string,
): Promise<string[]> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/memory`,
    { headers: headers(session) },
  );
  const body = await json<AgentMemory>(response);
  return Array.isArray(body.facts) ? body.facts : [];
}

export async function deleteMemory(
  session: Session,
  agentId: string,
  fact: string,
): Promise<void> {
  const payload: MemoryForget = { fact };
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/memory`,
    {
      method: "DELETE",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw await parseError(response);
}

export async function listMessages(
  session: Session,
  agentId: string,
  opts?: { threadId?: string },
): Promise<ChatMessage[]> {
  const params = new URLSearchParams();
  if (opts?.threadId) params.set("threadId", opts.threadId);
  const query = params.toString();
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/messages${query ? `?${query}` : ""}`,
    { headers: headers(session) },
  );
  return asList<ChatMessage>(await json<unknown>(response), "messages");
}

export type StreamHandlers = {
  onDelta: (
    messageId: string,
    delta: string,
    sender?: { senderId?: string; senderName?: string; senderAvatar?: string | null },
  ) => void;
  onDone: (message: ChatMessage | null) => void;
  onError: (code: string, message: string) => void;
  onTool?: (trace: {
    id: string;
    name: string;
    summary: string;
    ok?: boolean | null;
    senderId?: string;
    senderName?: string;
  }) => void;
  onConnectUrl?: (url: string, pluginId: string) => void;
};

export async function sendMessage(
  session: Session,
  agentId: string,
  content: string,
  images: ImageIn[],
  handlers: StreamHandlers,
  mentions: string[] = [],
  replyTo?: string | null,
  channelId?: string | null,
  extra?: {
    widgetReply?: { id: string; values?: string[]; dismissed?: boolean };
    connectReply?: { id?: string; dismissed?: boolean };
    approveReply?: { id: string; approved?: boolean; dismissed?: boolean };
    attachmentIds?: string[];
    regenerate?: boolean;
  },
): Promise<void> {
  const body: {
    content: string;
    images: ImageIn[];
    attachmentIds?: string[];
    mentions?: string[];
    replyTo?: string;
    channelId?: string;
    widgetReply?: { id: string; values?: string[]; dismissed?: boolean };
    connectReply?: { id?: string; dismissed?: boolean };
    approveReply?: { id: string; approved?: boolean; dismissed?: boolean };
    regenerate?: boolean;
  } = {
    content,
    images,
  };
  if (mentions.length) body.mentions = mentions;
  if (replyTo) body.replyTo = replyTo;
  if (channelId) body.channelId = channelId;
  if (extra?.widgetReply) body.widgetReply = extra.widgetReply;
  if (extra?.connectReply) body.connectReply = extra.connectReply;
  if (extra?.approveReply) body.approveReply = extra.approveReply;
  if (extra?.attachmentIds?.length) body.attachmentIds = extra.attachmentIds;
  if (extra?.regenerate) body.regenerate = true;
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/messages`,
    {
      method: "POST",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw await parseError(response);
  if (!response.body) throw new Error("Runtime returned an empty body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) dispatchSse(chunk, handlers);
  }
  if (buffer.trim()) dispatchSse(buffer, handlers);
}

export async function uploadAttachment(
  session: Session,
  agentId: string,
  file: File,
): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/attachments`,
    {
      method: "POST",
      headers: headers(session),
      body,
    },
  );
  return json<Attachment>(response);
}

export async function fetchAttachmentBlob(
  session: Session,
  url: string,
): Promise<Blob> {
  const response = await fetch(resolveMediaUrl(session.baseUrl, url), {
    headers: headers(session),
  });
  if (!response.ok) throw await parseError(response);
  return response.blob();
}

function dispatchSse(raw: string, handlers: StreamHandlers): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;
  const payload = JSON.parse(dataLines.join("\n")) as unknown;
  const record = isRecord(payload) ? payload : {};

  if (event === "message.delta") {
    const delta = payload as MessageDelta;
    const id = delta.id || (typeof record.message_id === "string" ? record.message_id : "");
    handlers.onDelta(id, delta.delta ?? "", {
      senderId: delta.senderId,
      senderName: delta.senderName,
      senderAvatar: delta.senderAvatar ?? null,
    });
  } else if (event === "message.done") {
    const messageRaw = isRecord(record.message) ? record.message : payload;
    handlers.onDone(
      isRecord(messageRaw) && typeof messageRaw.id === "string"
        ? (messageRaw as ChatMessage)
        : null,
    );
  } else if (event === "error") {
    handlers.onError("error", errorMessage(payload, "Unknown error"));
  } else if (event === "tool.start" || event === "tool.done") {
    const id = typeof record.id === "string" ? record.id : "";
    const name = typeof record.name === "string" ? record.name : "";
    const summary = typeof record.summary === "string" ? record.summary : "";
    if (!id || !summary) return;
    handlers.onTool?.({
      id,
      name,
      summary,
      ok: typeof record.ok === "boolean" ? record.ok : null,
      senderId: typeof record.senderId === "string" ? record.senderId : undefined,
      senderName: typeof record.senderName === "string" ? record.senderName : undefined,
    });
  } else if (event === "connect.url") {
    const url = typeof record.url === "string" ? record.url : "";
    const pluginId = typeof record.pluginId === "string" ? record.pluginId : "";
    if (url) handlers.onConnectUrl?.(url, pluginId);
  }
}

export function resolveMediaUrl(baseUrl: string, url: string): string {
  if (!url) return "";
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    /^https?:\/\//i.test(url)
  ) {
    return url;
  }
  const root = baseUrl.replace(/\/$/, "");
  return url.startsWith("/") ? `${root}${url}` : `${root}/${url}`;
}

export type WorkspaceEntry = {
  name: string;
  kind: "file" | "dir";
  size?: number | null;
};

export type WorkspaceListing = {
  root: string;
  path: string;
  entries: WorkspaceEntry[];
};

export type WorkspaceFile = {
  path: string;
  content: string;
  truncated?: boolean;
};

export async function listWorkspace(
  session: Session,
  agentId: string,
  path = ".",
): Promise<WorkspaceListing> {
  const params = new URLSearchParams({ path: path || "." });
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/workspace?${params}`,
    { headers: headers(session) },
  );
  return json<WorkspaceListing>(response);
}

export async function readWorkspaceFile(
  session: Session,
  agentId: string,
  path: string,
): Promise<WorkspaceFile> {
  const params = new URLSearchParams({ path });
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/workspace/file?${params}`,
    { headers: headers(session) },
  );
  return json<WorkspaceFile>(response);
}

export async function getComputer(
  session: Session,
  agentId: string,
): Promise<ComputerPreview> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/computer`,
    { headers: headers(session) },
  );
  return json<ComputerPreview>(response);
}

export async function openComputerSession(
  session: Session,
  agentId: string,
): Promise<{ sessionId: string }> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/computer/session`,
    { method: "POST", headers: headers(session) },
  );
  return json<{ sessionId: string }>(response);
}

export async function closeComputerSession(
  session: Session,
  agentId: string,
  sessionId?: string,
): Promise<void> {
  const suffix = sessionId
    ? `/computer/session/${encodeURIComponent(sessionId)}`
    : "/computer/session";
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}${suffix}`,
    { method: "DELETE", headers: headers(session) },
  );
  await json<void>(response);
}

export async function postComputerPointer(
  session: Session,
  agentId: string,
  body: { x: number; y: number; type: string },
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/computer/pointer`,
    {
      method: "POST",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
  );
  await json<void>(response);
}

export async function postComputerKey(
  session: Session,
  agentId: string,
  body: { key: string; type: string; text?: string },
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/computer/key`,
    {
      method: "POST",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
  );
  await json<void>(response);
}

export async function startComputerRecord(
  session: Session,
  agentId: string,
): Promise<{ recording: boolean }> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/computer/record`,
    { method: "POST", headers: headers(session) },
  );
  return json<{ recording: boolean }>(response);
}

export async function stopComputerRecord(
  session: Session,
  agentId: string,
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/computer/record`,
    { method: "DELETE", headers: headers(session) },
  );
  await json<void>(response);
}

export async function createSkill(
  session: Session,
  agentId: string,
  body: { name: string; body?: string },
): Promise<{ id: string; name: string }> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/skills`,
    {
      method: "POST",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
  );
  return json(response);
}

export async function listPlugins(session: Session): Promise<Plugin[]> {
  const response = await fetch(`${session.baseUrl}/v1/plugins`, {
    headers: headers(session),
  });
  return asList<Plugin>(await json<unknown>(response), "plugins");
}

export async function listPluginCatalog(
  session: Session,
): Promise<PluginCatalogEntry[]> {
  const response = await fetch(`${session.baseUrl}/v1/plugins/catalog`, {
    headers: headers(session),
  });
  return asList<PluginCatalogEntry>(await json<unknown>(response), "catalog");
}

export async function createPlugin(
  session: Session,
  body: PluginCreate,
): Promise<Plugin> {
  const response = await fetch(`${session.baseUrl}/v1/plugins`, {
    method: "POST",
    headers: headers(session, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return json<Plugin>(response);
}

export async function deletePlugin(
  session: Session,
  pluginId: string,
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/plugins/${encodeURIComponent(pluginId)}`,
    { method: "DELETE", headers: headers(session) },
  );
  await json<void>(response);
}

export async function startPluginAuth(
  session: Session,
  pluginId: string,
): Promise<PluginAuth> {
  const response = await fetch(
    `${session.baseUrl}/v1/plugins/${encodeURIComponent(pluginId)}/auth`,
    { method: "POST", headers: headers(session) },
  );
  return json<PluginAuth>(response);
}

export async function waitUntilPluginConnected(
  session: Session,
  pluginId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<boolean> {
  const timeout = opts?.timeoutMs ?? 60_000;
  const interval = opts?.intervalMs ?? 400;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const rows = await listPlugins(session);
    const row = rows.find((item) => item.id === pluginId);
    if (row?.status === "connected") return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}
