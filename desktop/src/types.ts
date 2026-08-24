export type Agent = {
  id: string;
  name: string;
  title: string;
  description: string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageImage = {
  id: string;
  mime: string;
  url: string;
};

export type ChatMessage = {
  id: string;
  agentId: string;
  role: "user" | "assistant";
  content: string;
  images: MessageImage[];
  createdAt: string;
};

export type MessageDelta = {
  id: string;
  role: "assistant";
  delta: string;
};

export type RuntimeHealth = {
  ok: boolean;
  name: string;
  version: string;
};

export type ImageIn = {
  mime: string;
  data: string;
};

export type AgentPatch = {
  name?: string;
  title?: string;
  description?: string;
  avatar?: string | null;
};

export type Session = {
  baseUrl: string;
  token: string;
};

export type ThemePref = "system" | "light" | "dark";
