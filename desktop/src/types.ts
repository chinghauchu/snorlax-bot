export type Agent = {
  id: string;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
};

export type Attachment = {
  id: string;
  filename: string;
  media_type: string;
  sent_to_model: boolean;
};

export type ChatMessage = {
  id: string;
  agent_id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  created_at: string;
};

export type RuntimeHealth = {
  status: string;
  model: string;
  inference_backend: string;
  seeded_agent_id: string;
  bind_host: string;
};

export type AttachmentIn = {
  filename: string;
  media_type: string;
  data_base64?: string;
};
