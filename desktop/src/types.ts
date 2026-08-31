import type { components } from "./openapi";

export type Agent = components["schemas"]["Agent"];
export type AgentCreate = components["schemas"]["AgentCreate"];
export type AgentPatch = components["schemas"]["AgentPatch"];
export type ChatMessage = components["schemas"]["Message"];
export type MessageImage = components["schemas"]["ImageOut"];
export type ImageIn = components["schemas"]["ImageIn"];
export type Attachment = components["schemas"]["Attachment"];
export type MessageDelta = components["schemas"]["MessageDelta"];
export type ToolTrace = components["schemas"]["ToolTrace"];
export type RuntimeHealth = components["schemas"]["Health"];
export type ErrorBody = components["schemas"]["ErrorBody"];
export type Routine = components["schemas"]["Routine"];
export type RoutinePatch = components["schemas"]["RoutinePatch"];
export type RoutineCreate = components["schemas"]["RoutineCreate"];
export type Skill = components["schemas"]["Skill"];
export type SkillBody = components["schemas"]["SkillBody"];
export type SkillPatch = components["schemas"]["SkillPatch"];
export type AgentMemory = components["schemas"]["AgentMemory"];
export type MemoryForget = components["schemas"]["MemoryForget"];
export type Plugin = components["schemas"]["Plugin"];
export type PluginAuth = components["schemas"]["PluginAuth"];
export type PluginCreate = components["schemas"]["PluginCreate"];
export type PluginCatalogEntry = components["schemas"]["PluginCatalogEntry"];
export type ComputerPreview = components["schemas"]["ComputerPreview"];
export type ComputerSession = components["schemas"]["ComputerSession"];

export type Session = {
  baseUrl: string;
  token: string;
};

export type ThemePref = "system" | "light" | "dark";
