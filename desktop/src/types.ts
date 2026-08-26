import type { components } from "./openapi";

export type Agent = components["schemas"]["Agent"];
export type AgentCreate = components["schemas"]["AgentCreate"];
export type AgentPatch = components["schemas"]["AgentPatch"];
export type ChatMessage = components["schemas"]["Message"];
export type MessageImage = components["schemas"]["ImageOut"];
export type ImageIn = components["schemas"]["ImageIn"];
export type MessageDelta = components["schemas"]["MessageDelta"];
export type ToolTrace = components["schemas"]["ToolTrace"];
export type RuntimeHealth = components["schemas"]["Health"];
export type ErrorBody = components["schemas"]["ErrorBody"];
export type Routine = components["schemas"]["Routine"];
export type RoutinePatch = components["schemas"]["RoutinePatch"];
export type Plugin = components["schemas"]["Plugin"];
export type PluginAuth = components["schemas"]["PluginAuth"];
export type PluginCreate = components["schemas"]["PluginCreate"];

export type Session = {
  baseUrl: string;
  token: string;
};

export type ThemePref = "system" | "light" | "dark";
