import type {
  Agent,
  AttachmentIn,
  ChatMessage,
  RuntimeHealth,
} from "./types";

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

export async function health(session: Session): Promise<RuntimeHealth> {
  const response = await fetch(`${session.baseUrl}/v1/health`, {
    headers: headers(session),
  });
  return json<RuntimeHealth>(response);
}

export async function listAgents(session: Session): Promise<Agent[]> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    headers: headers(session),
  });
  const body = await json<{ agents: Agent[] }>(response);
  return body.agents;
}

export async function createAgent(
  session: Session,
  name: string,
  instructions: string,
): Promise<Agent> {
  const response = await fetch(`${session.baseUrl}/v1/agents`, {
    method: "POST",
    headers: headers(session, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name, instructions }),
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
  const body = await json<{ messages: ChatMessage[] }>(response);
  return body.messages;
}

export type StreamHandlers = {
  onDelta: (messageId: string, delta: string) => void;
  onDone: (message: ChatMessage) => void;
  onError: (code: string, message: string) => void;
};

export async function sendMessage(
  session: Session,
  agentId: string,
  content: string,
  attachments: AttachmentIn[],
  handlers: StreamHandlers,
): Promise<void> {
  const response = await fetch(
    `${session.baseUrl}/v1/agents/${encodeURIComponent(agentId)}/messages`,
    {
      method: "POST",
      headers: headers(session, { "Content-Type": "application/json" }),
      body: JSON.stringify({ content, attachments }),
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
    handlers.onDelta(String(payload.message_id), String(payload.delta ?? ""));
  } else if (event === "message.done") {
    handlers.onDone(payload.message as ChatMessage);
  } else if (event === "error") {
    const err = payload.error as { code?: string; message?: string };
    handlers.onError(err?.code ?? "error", err?.message ?? "Unknown error");
  }
}
