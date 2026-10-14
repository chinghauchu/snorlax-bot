// SPDX-License-Identifier: Apache-2.0

export const MODEL_PROVIDERS = [
  { id: "omlx", label: "Local (oMLX)" },
  { id: "vllm", label: "Spark (vLLM)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Google Gemini" },
  { id: "grok", label: "xAI Grok" },
] as const;

export const KEY_PROVIDERS = ["openai", "anthropic", "gemini", "grok"] as const;

export type ModelProviderId = (typeof MODEL_PROVIDERS)[number]["id"];

export function providerLabel(id: string): string {
  return MODEL_PROVIDERS.find((row) => row.id === id)?.label ?? id;
}

export function modelChoice(
  provider: string,
  id: string,
): { provider: ModelProviderId; id: string } | null {
  const trimmed = id.trim();
  const known = MODEL_PROVIDERS.find((row) => row.id === provider);
  if (!known || provider === "default" || !trimmed) return null;
  return { provider: known.id, id: trimmed };
}

export function modelSummary(
  model: { provider: string; id: string } | null | undefined,
): string {
  if (!model?.provider || !model.id) return "Use default";
  return `${providerLabel(model.provider)} · ${model.id}`;
}

export function bubbleModel(model: string | null | undefined): string | null {
  const text = (model ?? "").trim();
  return text || null;
}

export function isModelKeyError(code: string | null | undefined): boolean {
  return code === "missing_key" || code === "invalid_key";
}

/** The sentence stays plain. Settings is the link, not part of the body. */
export function modelErrorCopy(content: string): { text: string; link: "Settings" } {
  const stripped = content.replace(/\s*Settings\.?\s*$/, "").trim();
  return { text: stripped || content, link: "Settings" };
}
