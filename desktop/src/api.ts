import type {
  Agent,
  AgentPatch,
  ChatMessage,
  ImageIn,
  MessageImage,
  RuntimeHealth,
  Session,
} from "./types";

export const SEED_AGENT_ID = "snorlax-bot";

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

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function unwrapList(body: unknown, wrappedKey: string): unknown[] {
  if (Array.isArray(body)) return body;
  if (isRecord(body) && Array.isArray(body[wrappedKey])) {
    return body[wrappedKey] as unknown[];
  }
  return [];
}

/** Tiny read adapter so the camelCase UI still paints while Backend rewrites snake_case. */
export function normalizeAgent(raw: unknown): Agent {
  const o = isRecord(raw) ? raw : {};
  const avatar = o.avatar;
  return {
    id: asString(o.id),
    name: asString(o.name, "Agent"),
    title: asString(o.title),
    description: asString(o.description) || asString(o.instructions),
    avatar: typeof avatar === "string" && avatar.length > 0 ? avatar : null,
    createdAt: asString(o.createdAt) || asString(o.created_at),
    updatedAt: asString(o.updatedAt) || asString(o.updated_at),
  };
}

function normalizeImage(raw: unknown): MessageImage {
  const o = isRecord(raw) ? raw : {};
  return {
    id: asString(o.id),
    mime: asString(o.mime) || asString(o.media_type),
    url: asString(o.url),
  };
}

export function normalizeMessage(raw: unknown): ChatMessage {
  const o = isRecord(raw) ? raw : {};
  const images = Array.isArray(o.images)
    ? o.images
    : Array.isArray(o.attachments)
      ? o.attachments
      : [];
  return {
    id: asString(o.id),
    agentId: asString(o.agentId) || asString(o.agent_id),
    role: o.role === "assistant" ? "assistant" : "user",
    content: asString(o.content),
    images: images.map(normalizeImage),
    createdAt: asString(o.createdAt) || asString(o.created_at),
  };
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new ApiError(
      response.status,
      body.error?.code ?? "http_error",
      body.error?.message ?? response.statusText,
    );
  } catch {
    return new ApiError(response.status, "http_error", response.statusText);
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function health(baseUrl: string): Promise<RuntimeHealth> {
  const response = await fetch(`${baseUrl}/v1/health`);
  const body = await json<Record<string, unknown>>(response);
  return {
    ok: body.ok === true || asString(body.status) === "ok",
    name: asString(body.name, "snorlax-runtime"),
    version: asString(body.version),
  };
}

export async function listAgents(session: Session): Promise<Agent[]> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    headers: headers(session),
  });
  const body = await json<unknown>(response);
  return unwrapList(body, "agents").map(normalizeAgent);
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
  return normalizeAgent(await json<unknown>(response));
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
  return normalizeAgent(await json<unknown>(response));
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
): Promise<ChatMessage[]> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/messages`,
    { headers: headers(session) },
  );
  const body = await json<unknown>(response);
  return unwrapList(body, "messages").map(normalizeMessage);
}

export type StreamHandlers = {
  onDelta: (messageId: string, delta: string) => void;
  onDone: (message: ChatMessage | null) => void;
  onError: (code: string, message: string) => void;
};

export async function sendMessage(
  session: Session,
  agentId: string,
  content: string,
  images: ImageIn[],
  handlers: StreamHandlers,
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/messages`,
    {
      method: "POST",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify({ content, images }),
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
    const id = asString(record.id) || asString(record.message_id);
    handlers.onDelta(id, asString(record.delta));
  } else if (event === "message.done") {
    const messageRaw = isRecord(record.message) ? record.message : payload;
    handlers.onDone(
      isRecord(messageRaw) && (messageRaw.id || messageRaw.role)
        ? normalizeMessage(messageRaw)
        : null,
    );
  } else if (event === "error") {
    const err = isRecord(record.error) ? record.error : record;
    handlers.onError(
      asString(err.code, "error"),
      asString(err.message, "Unknown error"),
    );
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
