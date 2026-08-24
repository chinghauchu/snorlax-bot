import type { Agent, ChatMessage, Health, ImageIn } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Session = {
  baseUrl: string;
  token: string;
};

function headers(session: Session, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Authorization", `Bearer ${session.token}`);
  return h;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: string };
    return new ApiError(response.status, body.error ?? response.statusText);
  } catch {
    return new ApiError(response.status, response.statusText);
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function health(baseUrl: string): Promise<Health> {
  const response = await fetch(`${baseUrl}/v1/health`);
  return json<Health>(response);
}

export async function listAgents(session: Session): Promise<Agent[]> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    headers: headers(session),
  });
  return json<Agent[]>(response);
}

export async function createAgent(
  session: Session,
  name: string,
  title: string,
  description: string,
): Promise<Agent> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    method: "POST",
    headers: headers(session, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name, title, description, avatar: null }),
  });
  return json<Agent>(response);
}

export async function listMessages(
  session: Session,
  agentId: string,
): Promise<ChatMessage[]> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/messages`,
    { headers: headers(session) },
  );
  return json<ChatMessage[]>(response);
}

export type StreamHandlers = {
  onDelta: (messageId: string, delta: string) => void;
  onDone: (message: ChatMessage) => void;
  onError: (message: string) => void;
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
    for (const chunk of chunks) {
      dispatchSse(chunk, handlers);
    }
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
  const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  if (event === "message.delta") {
    handlers.onDelta(String(payload.id), String(payload.delta ?? ""));
  } else if (event === "message.done") {
    handlers.onDone(payload as unknown as ChatMessage);
  } else if (event === "error") {
    handlers.onError(String(payload.error ?? "Unknown error"));
  }
}
