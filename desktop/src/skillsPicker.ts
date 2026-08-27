// SPDX-License-Identifier: Apache-2.0

export type SkillCandidate = {
  id: string;
  name: string;
};

/** `/query` at the start of a token. `https://` is not a trigger. */
const SLASH_TRIGGER = /(?:^|\s)\/([^\s]*)$/;

export function skillTrigger(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(SLASH_TRIGGER);
  if (!match) return null;
  return { start: before.length - match[1].length - 1, query: match[1] };
}

export function filterSkills(
  skills: SkillCandidate[],
  query: string,
): SkillCandidate[] {
  const q = query.toLowerCase();
  return skills.filter((skill) => skill.name.toLowerCase().startsWith(q));
}

/** Insert `/name` as plain text. Not a chip. Does not send. */
export function insertSkill(
  text: string,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const trigger = skillTrigger(text, caret);
  const after = text.slice(caret);
  const pad = after.startsWith(" ") ? "" : " ";
  if (!trigger) {
    const inserted = `${text.slice(0, caret)}/${name}${pad}${after}`;
    return { text: inserted, caret: caret + name.length + 1 + pad.length };
  }
  const next = `${text.slice(0, trigger.start)}/${name}${pad}${after}`;
  return { text: next, caret: trigger.start + name.length + 1 + pad.length };
}

/** 1:1 agent composer only. Empty list or no prefix match → no popup. */
export function skillPopupOpen(
  skills: SkillCandidate[],
  query: string | null,
  conversation?: { kind?: string } | null,
): boolean {
  if (!conversation || conversation.kind === "channel") return false;
  if (query === null) return false;
  return filterSkills(skills, query).length > 0;
}

/** Channel `/` is plain text — no typeahead and no GET. */
export function composerSkillAgentId(
  conversation: { id: string; kind?: string } | null,
): string | null {
  if (!conversation || conversation.kind === "channel") return null;
  return conversation.id;
}
