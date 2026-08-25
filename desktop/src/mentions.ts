export type MentionCandidate = {
  id: string;
  name: string;
  avatar: string | null;
};

export const USER_SENDER_ID = "user";
export const EVERYONE_ID = "everyone";

const AT_TOKEN = /(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9._-]*)/g;
const AT_TRIGGER = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9._-]*)$/;

export function isUserSender(senderId: string | undefined, role?: string): boolean {
  if (senderId) return senderId === USER_SENDER_ID;
  return role === "user";
}

export function senderKey(senderId: string | undefined, role?: string): string {
  if (senderId) return senderId;
  return role === "user" ? USER_SENDER_ID : "assistant";
}

export function mentionTrigger(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(AT_TRIGGER);
  if (!match) return null;
  return { start: before.length - match[1].length - 1, query: match[1] };
}

export function filterCandidates(
  agents: MentionCandidate[],
  query: string,
  includeEveryone: boolean,
): MentionCandidate[] {
  const q = query.toLowerCase();
  const people = agents.filter((a) => a.name.toLowerCase().startsWith(q));
  if (includeEveryone && "everyone".startsWith(q)) {
    return [{ id: EVERYONE_ID, name: "everyone", avatar: null }, ...people];
  }
  return people;
}

export function insertMention(
  text: string,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const trigger = mentionTrigger(text, caret);
  const after = text.slice(caret);
  const pad = after.startsWith(" ") ? "" : " ";
  if (!trigger) {
    const inserted = `${text.slice(0, caret)}@${name}${pad}${after}`;
    return { text: inserted, caret: caret + name.length + 1 + pad.length };
  }
  const next = `${text.slice(0, trigger.start)}@${name}${pad}${after}`;
  return { text: next, caret: trigger.start + name.length + 1 + pad.length };
}

/** Composer chips are only names picked from typeahead, not every roster name. */
export function pickedChipNames(picked: Map<string, string>): string[] {
  return [...picked.keys()];
}

export function isTranscriptVisible(
  message: { senderId?: string; role?: string },
  conversation: { id: string; kind?: string },
): boolean {
  if (conversation.kind === "channel") return true;
  if (isUserSender(message.senderId, message.role)) return true;
  return (message.senderId || "") === conversation.id;
}

export function mentionIdsInText(
  text: string,
  picked: Map<string, string>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(AT_TOKEN)) {
    const token = match[1];
    const id = picked.get(token.toLowerCase());
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export type TextPiece =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; resolved: boolean };

export function splitMentions(
  text: string,
  knownNames: string[],
): TextPiece[] {
  const names = knownNames.map((n) => n.toLowerCase());
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(AT_TOKEN)) {
    const idx = match.index ?? 0;
    if (idx > last) pieces.push({ type: "text", value: text.slice(last, idx) });
    const token = match[1];
    const t = token.toLowerCase();
    const resolved = names.includes(t);
    pieces.push({ type: "mention", value: match[0], resolved });
    last = idx + match[0].length;
  }
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  return pieces;
}
