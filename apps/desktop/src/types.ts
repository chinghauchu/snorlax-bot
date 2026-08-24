export type Agent = {
  id: string;
  name: string;
  title: string;
  description: string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImageOut = {
  id: string;
  mime: string;
  url: string;
};

export type ChatMessage = {
  id: string;
  agentId: string;
  role: "user" | "assistant";
  content: string;
  images: ImageOut[];
  createdAt: string;
};

export type Health = {
  ok: boolean;
  name: string;
  version: string;
};

export type ImageIn = {
  mime: string;
  data: string;
};
