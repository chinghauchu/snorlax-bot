// SPDX-License-Identifier: Apache-2.0

export const SEED_AGENT_ID = "snorlax-bot";
export const SEED_CHANNEL_ID = "snorlax-bot-group";

/** Sidebar delete is allowed for every roster row, including the seed channel. */
export function canDeleteAgent(_agent: { id?: string; kind: string }): boolean {
  return true;
}

export function canEditChannel(agent: { id?: string; kind: string }): boolean {
  return agent.kind === "channel" && agent.id !== SEED_CHANNEL_ID;
}

/** Seed + user-created channel panes both expose the shared-project toggle. */
export function canToggleSharedProject(agent: { kind: string }): boolean {
  return agent.kind === "channel";
}

/** Design helper under the Channel subtitle. Not a Mac folder picker. */
export const SHARED_PROJECT_HINT =
  "On: channel threads share a sandbox. Off: each agent’s workspace. Not a folder on this Mac.";

export function infoPaneKind(agent: { kind: string }): "agent" | "channel" {
  return agent.kind === "channel" ? "channel" : "agent";
}

export function displayInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function channelMembers<T extends { id: string; kind: string }>(
  memberIds: string[],
  roster: T[],
): T[] {
  const byId = new Map(roster.map((row) => [row.id, row]));
  const out: T[] = [];
  for (const id of memberIds) {
    const row = byId.get(id);
    if (row && row.kind !== "channel") out.push(row);
  }
  return out;
}

/**
 * Fallback roster row when the current selection is gone.
 * Seed channel present → prefer a channel (historical first-load).
 * Seed channel gone → agent first, else a remaining channel.
 * Never invent `snorlax-bot-group`.
 */
export function fallbackRosterSelection<T extends { id: string; kind: string }>(
  roster: T[],
): string | null {
  if (roster.length === 0) return null;
  if (roster.some((row) => row.id === SEED_CHANNEL_ID)) {
    return (
      roster.find((row) => row.kind === "channel")?.id ??
      roster.find((row) => row.id === SEED_AGENT_ID)?.id ??
      roster[0]?.id ??
      null
    );
  }
  return (
    roster.find((row) => row.kind === "agent")?.id ??
    roster.find((row) => row.kind === "channel")?.id ??
    roster[0]?.id ??
    null
  );
}

/** After deleting a row, keep the current selection if it remains. Else fallback. */
export function nextRosterSelection<T extends { id: string; kind: string }>(
  roster: T[],
  removedId: string | null,
  currentId: string | null,
): string | null {
  if (
    currentId &&
    currentId !== removedId &&
    roster.some((row) => row.id === currentId)
  ) {
    return currentId;
  }
  return fallbackRosterSelection(roster);
}

export const EMPTY_ROUTINES = "No routines yet.";
export const WEBHOOK_COPY_FEEDBACK_MS = 1500;
export const ADD_ROUTINE_TITLE = "Add routine";
export const CRON_PLACEHOLDER = "0 9 * * 1-5";
export const CRON_HINT = "Taipei. Weekdays 9:00 is 0 9 * * 1-5.";
export const NO_SKILLS_YET = "No skills yet.";

export type RoutineAddMode = "schedule" | "webhook" | "slack" | "github";

export const SLACK_CHANNEL_PLACEHOLDER = "#eng";
export const GITHUB_REPO_PLACEHOLDER = "owner/name";
export const SLACK_HINT = "Channel the bot is in.";
export const GITHUB_HINT = "One repo. No wildcards.";

export function routineRemoveConfirm(name: string): string {
  return `Remove ${name}?`;
}

export function canSubmitRoutine(draft: {
  name: string;
  skill: string;
  mode: RoutineAddMode;
  schedule?: string;
  channel?: string;
  repo?: string;
}): boolean {
  if (!draft.name.trim() || !draft.skill.trim()) return false;
  if (draft.mode === "schedule") {
    return Boolean((draft.schedule || "").trim());
  }
  if (draft.mode === "slack") {
    return Boolean((draft.channel || "").trim());
  }
  if (draft.mode === "github") {
    return Boolean((draft.repo || "").trim());
  }
  return true;
}

export const EMPTY_SKILLS = "No skills yet.";
export const EDIT_SKILL_TITLE = "Edit skill";
export const ADD_SKILL_TITLE = "New skill";

export function skillRemoveConfirm(name: string): string {
  return `Remove ${name}?`;
}

export function canSubmitSkill(draft: { name: string; body: string }): boolean {
  return Boolean(draft.name.trim() && draft.body.trim());
}

export type RoutineTriggerLine = {
  kind?: string | null;
  skill?: string;
  schedule?: string | null;
  scheduleLabel?: string | null;
  label?: string | null;
  webhookUrl?: string | null;
};

export type PluginConnectedHint = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
};

/** Humanized Asia/Taipei cron for the muted routine line. Client concern. */
export function humanizeTaipeiCron(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = fields;
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return cron;
  const clock = `${Number(hour)}:${String(Number(minute)).padStart(2, "0")}`;
  if (dom === "*" && month === "*" && dow === "*") return `Every day ${clock}`;
  if (dom === "*" && month === "*" && (dow === "1-5" || dow === "1,2,3,4,5")) {
    return `Weekdays ${clock}`;
  }
  if (dom === "*" && month === "*" && (dow === "0,6" || dow === "6,0")) {
    return `Weekends ${clock}`;
  }
  return cron;
}

export function isWebhookRoutine(routine: RoutineTriggerLine): boolean {
  return (routine.kind || "").trim().toLowerCase() === "webhook";
}

export function showsWebhookCopy(routine: RoutineTriggerLine): boolean {
  return isWebhookRoutine(routine) && Boolean((routine.webhookUrl || "").trim());
}

export function pluginKindConnected(
  plugins: PluginConnectedHint[],
  kind: string,
): boolean {
  const needle = kind.trim().toLowerCase();
  return plugins.some((row) => {
    if ((row.status || "") !== "connected") return false;
    const blob = `${row.id || ""} ${row.name || ""}`.toLowerCase();
    return blob.includes(needle);
  });
}

/** Slack/GitHub rows only when that MCP plugin is already connected. */
export function visiblePaneRoutines<T extends RoutineTriggerLine>(
  routines: T[],
  plugins: PluginConnectedHint[],
): T[] {
  return routines.filter((row) => {
    const kind = (row.kind || "").trim().toLowerCase();
    if (kind === "slack" || kind === "github") {
      return pluginKindConnected(plugins, kind);
    }
    return true;
  });
}

/** Muted identity-pane line: trigger only (`Webhook` / `Weekdays 9:00`). Never the URL. */
export function routineMutedLine(routine: RoutineTriggerLine): string {
  const kind = (routine.kind || "").trim().toLowerCase();
  if (kind === "webhook" || isWebhookRoutine(routine)) return "Webhook";
  if (kind === "slack") return (routine.label || "").trim() || "Slack";
  if (kind === "github") return (routine.label || "").trim() || "GitHub";
  const when =
    (routine.scheduleLabel || "").trim() ||
    humanizeTaipeiCron(routine.schedule || "");
  return when;
}

export function webhookCopyText(routine: {
  webhookUrl?: string | null;
}): string {
  return (routine.webhookUrl || "").trim();
}
