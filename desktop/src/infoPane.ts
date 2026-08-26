// SPDX-License-Identifier: Apache-2.0

export const SEED_AGENT_ID = "snorlax-bot";
export const SEED_CHANNEL_ID = "snorlax-bot-group";

/** Seed channel is not deletable. Agents (including seed) and user channels are. */
export function canDeleteAgent(agent: { id?: string; kind: string }): boolean {
  return agent.id !== SEED_CHANNEL_ID;
}

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

/** After deleting an agent, prefer the channel. Never invent a missing seed. */
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
  return (
    roster.find((row) => row.kind === "channel")?.id ??
    roster.find((row) => row.id === SEED_AGENT_ID)?.id ??
    roster[0]?.id ??
    null
  );
}
