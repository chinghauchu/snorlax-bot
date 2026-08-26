import type {
  Agent,
  AgentPatch,
  ChatMessage,
  ImageIn,
  MessageDelta,
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
  return (await response.json()) as T;
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
): Promise<void> {
  const body: {
    content: string;
    images: ImageIn[];
    mentions?: string[];
    replyTo?: string;
    channelId?: string;
  } = {
    content,
    images,
  };
  if (mentions.length) body.mentions = mentions;
  if (replyTo) body.replyTo = replyTo;
  if (channelId) body.channelId = channelId;
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
