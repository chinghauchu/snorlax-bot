// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { FILTER_UNREAD, rosterForFilter } from "./chatListFilter.ts";
import {
  audibleUnreadIds,
  paintsUnreadAccent,
  replyMayMarkUnread,
} from "./chatMute.ts";
import { ChatUnread, rowShowsUnreadDot } from "./chatUnread.ts";
import { unreadChrome, unreadReplyCount } from "./unreadOutside.ts";
import {
  MARK_OPEN_CHAT_ACTION,
  MARK_OPEN_CHAT_KEYS,
  isMarkOpenChatChord,
  markOpenChatBlocked,
  markOpenChatShouldApply,
  overlayTextFieldOwnsMarkOpenChat,
} from "./markOpenChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "markOpenChat.ts"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkOpenChat.swift"),
  "utf8",
);
const sheet = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);

const PHRASE =
  "v1.10 mark the open chat unread from the keyboard (Cmd/Ctrl-Shift-U marks the currently open chat unread through the same local-state path as the v0.90 sidebar Mark as unread action; a read chat paints that same accent unread dot, counts toward the unread count outside the chat list, and shows under the Unread filter; opening the chat again clears it; the same sidebar control marks a chat read when it already shows the dot, so the chord does that too and a key repeat does not flap; a muted chat follows the sidebar and does not pick up a dot or an unread count from this mark or from a new reply; the chord still works from the composer and does not insert text; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing changes when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift U; iOS hardware command-shift-U marks the open chat the same way and is listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  chatOpen: true,
  composing: false,
  overlayTextField: false,
  inCard: false,
  findOpen: false,
  switchOpen: false,
  shortcutsOpen: false,
  renaming: false,
  lightboxOpen: false,
  menuOpen: false,
  blocked: false,
};

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

/**
 * The v0.90 sidebar control. A dotted row is marked read, including a
 * channel handoff dot. A muted row that is not dotted stays put.
 * A read, unmuted row is marked unread in the persisted set.
 */
function applySidebarMark(
  id: string,
  unread: ChatUnread,
  handoff: Set<string>,
  mutedIds: readonly string[],
): { reply: Set<string>; handoff: Set<string> } {
  const published = audibleUnreadIds(unread.snapshot(), mutedIds);
  const muted = mutedIds.includes(id);
  if (rowShowsUnreadDot(id, published, handoff)) {
    unread.clear(id);
    handoff.delete(id);
    return {
      reply: audibleUnreadIds(unread.snapshot(), mutedIds),
      handoff,
    };
  }
  if (!replyMayMarkUnread(muted)) {
    return { reply: published, handoff };
  }
  unread.mark(id);
  return {
    reply: audibleUnreadIds(unread.snapshot(), mutedIds),
    handoff,
  };
}

test("Cmd/Ctrl-Shift-U marks; other chords do not", () => {
  assert.equal(isMarkOpenChatChord({ key: "u", metaKey: true, shiftKey: true }), true);
  assert.equal(isMarkOpenChatChord({ key: "U", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isMarkOpenChatChord({ key: "U", metaKey: true, shiftKey: true }), true);
  assert.equal(isMarkOpenChatChord({ key: "u", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isMarkOpenChatChord({ key: "u", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isMarkOpenChatChord({ key: "u", metaKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "u", ctrlKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "u", shiftKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "u", metaKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(
    isMarkOpenChatChord({ key: "u", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isMarkOpenChatChord({ key: "u" }), false);
  assert.equal(isMarkOpenChatChord({ key: "k", metaKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "m", metaKey: true, shiftKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "p", metaKey: true, shiftKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "l", metaKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "n", metaKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "Backspace", metaKey: true, shiftKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "/", metaKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "1", metaKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "9", ctrlKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "PageUp" }), false);
  assert.equal(isMarkOpenChatChord({ key: "Home", metaKey: true }), false);
  assert.equal(isMarkOpenChatChord({ key: "Escape" }), false);
  assert.equal(isMarkOpenChatChord({ key: "ArrowUp" }), false);
  assert.equal(markOpenChatShouldApply({ repeat: false }), true);
  assert.equal(markOpenChatShouldApply({}), true);
  assert.equal(markOpenChatShouldApply({ repeat: true }), false);
  assert.equal(MARK_OPEN_CHAT_KEYS, "Cmd/Ctrl Shift U");
  assert.equal(MARK_OPEN_CHAT_ACTION, "Mark as unread or read");
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsMarkOpenChat(true, true), false);
  assert.equal(overlayTextFieldOwnsMarkOpenChat(true, false), true);
  assert.equal(overlayTextFieldOwnsMarkOpenChat(false, false), false);
  assert.equal(overlayTextFieldOwnsMarkOpenChat(false, true), false);
  assert.equal(markOpenChatBlocked(openGate), false);
  assert.equal(markOpenChatBlocked({ ...openGate, chatOpen: false }), true);
  for (const flag of [
    "composing",
    "overlayTextField",
    "inCard",
    "findOpen",
    "switchOpen",
    "shortcutsOpen",
    "renaming",
    "lightboxOpen",
    "menuOpen",
    "blocked",
  ] as const) {
    assert.equal(markOpenChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("sidebar mark paints the dot, counts, and filters; a repeat does not flap", () => {
  const rows = [{ id: "open" }, { id: "other" }];
  const unread = new ChatUnread(null);
  const handoff = new Set<string>();
  const first = applySidebarMark("open", unread, handoff, []);
  assert.equal(unread.has("open"), true);
  assert.equal(paintsUnreadAccent(false, first.reply.has("open")), true);
  assert.equal(unreadReplyCount(first.reply), 1);
  assert.equal(unreadChrome(first.reply).title, "(1) Snorlax-Bot");
  assert.deepEqual(
    rosterForFilter(rows, FILTER_UNREAD, (row) =>
      paintsUnreadAccent(false, first.reply.has(row.id) || first.handoff.has(row.id)),
    ).map((row) => row.id),
    ["open"],
  );

  const held = unread.snapshot();
  assert.equal(markOpenChatShouldApply({ repeat: true }), false);
  assert.deepEqual(unread.snapshot(), held);

  const read = applySidebarMark("open", unread, handoff, []);
  assert.equal(unread.has("open"), false);
  assert.equal(paintsUnreadAccent(false, read.reply.has("open")), false);
  assert.equal(unreadChrome(read.reply).badge, null);
  assert.equal(
    rosterForFilter(rows, FILTER_UNREAD, (row) => read.reply.has(row.id)).length,
    0,
  );

  unread.mark("open");
  unread.clear("open");
  assert.equal(unread.has("open"), false);

  const mutedStore = new ChatUnread(null);
  const muted = applySidebarMark("open", mutedStore, new Set(), ["open"]);
  assert.equal(mutedStore.has("open"), false);
  assert.equal(paintsUnreadAccent(true, true), false);
  assert.equal(replyMayMarkUnread(true), false);
  assert.equal(unreadReplyCount(muted.reply), 0);
  assert.equal(
    rosterForFilter(rows, FILTER_UNREAD, (row) =>
      paintsUnreadAccent(row.id === "open", muted.reply.has(row.id)),
    ).length,
    0,
  );

  const handoffOnly = new ChatUnread(null);
  const channel = new Set(["open"]);
  const cleared = applySidebarMark("open", handoffOnly, channel, []);
  assert.equal(handoffOnly.has("open"), false);
  assert.equal(cleared.handoff.has("open"), false);
});

test("desktop wires Cmd/Ctrl-Shift-U to the existing sidebar Mark path", () => {
  const block = sliceFn(
    app,
    "const onMarkOpenChat",
    'addEventListener("keydown", onMarkOpenChat, true)',
  );
  assert.match(block, /isMarkOpenChatChord\(/);
  assert.match(block, /markOpenChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsMarkOpenChat\(/);
  assert.match(block, /focusIsTextField\(event\.target\)/);
  assert.match(block, /event\.target === composerRef\.current/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
  assert.match(block, /chatOpen: active != null/);
  assert.match(block, /findOpen/);
  assert.match(block, /switchOpen/);
  assert.match(block, /shortcutsOpen/);
  assert.match(block, /renamingId != null/);
  assert.match(block, /lightboxTarget != null/);
  assert.match(block, /contextMenu != null/);
  assert.match(block, /mentionOpen/);
  assert.match(block, /skillMenuOpen/);
  assert.match(block, /preventDefault/);
  assert.match(block, /stopPropagation/);
  assert.match(block, /markOpenChatShouldApply/);
  assert.match(block, /markOpenChatRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const applyAt = block.indexOf("markOpenChatShouldApply");
  const callAt = block.indexOf("markOpenChatRef.current()");
  assert.ok(preventAt >= 0 && applyAt > preventAt && callAt > applyAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /chatUnread\.current\.mark/);
  assert.doesNotMatch(block, /chatUnread\.current\.clear/);

  const call = sliceFn(app, "markOpenChatRef.current = () => {", "useEffect(() => {");
  assert.match(call, /active\?\.id/);
  assert.match(call, /onToggleRead\(id\)/);
  assert.doesNotMatch(call, /onSend\(/);
  assert.doesNotMatch(call, /chatUnread\.current\.mark/);

  const toggle = sliceFn(app, "function onToggleRead(", "function onMarkAllRead(");
  assert.match(toggle, /rowShowsUnreadDot\(id, replyUnreadIds, unreadIds\)/);
  assert.match(toggle, /replyMayMarkUnread\(isChatMuted\(mutedChatIdsRef\.current, id\)\)/);
  assert.match(toggle, /chatUnread\.current\.clear\(id\)/);
  assert.match(toggle, /chatUnread\.current\.mark\(id\)/);
  assert.match(toggle, /publishReplyUnread\(\)/);
  const dotAt = toggle.indexOf("rowShowsUnreadDot");
  const muteAt = toggle.indexOf("replyMayMarkUnread");
  const markAt = toggle.indexOf("chatUnread.current.mark");
  assert.ok(dotAt >= 0 && muteAt > dotAt && markAt > muteAt);

  const load = sliceFn(app, "async function loadConversation(", "async function selectAgent(");
  assert.match(load, /clearReplyUnread\(id\)/);

  const row = CHAT_SHORTCUTS.find((item) => item.id === "mark-unread");
  assert.ok(row);
  assert.equal(row.keys, MARK_OPEN_CHAT_KEYS);
  assert.equal(row.action, MARK_OPEN_CHAT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift U/);
  assert.match(shortcuts, /Mark as unread or read/);
  assert.match(shortcuts, /v1\.10/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-U uses toggleChatRead; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧U"/);
  assert.match(swift, /static let action = "Mark as unread or read"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func markOpenChatKey/);
  assert.match(chat, /MarkOpenChat\.isChord/);
  assert.match(chat, /model\.toggleChatRead\(agent\.id\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /func markOpenChatFromComposer/);
  assert.match(chat, /hasRealAgent/);
  const keyFn = sliceFn(chat, "func markOpenChatKey", "func markOpenChatFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const toggleAt = keyFn.indexOf("toggleChatRead");
  assert.ok(repeatAt >= 0 && toggleAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func markOpenChatFromComposer", "func chatNavKey");
  assert.match(fromComposer, /model\.toggleChatRead\(agent\.id\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const commands = sliceFn(composer, "func markOpenChatCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "u"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func markOpenChatFromShortcut/);
  const selector = sliceFn(composer, "func markOpenChatFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /markOpenChatConsumed/);
  assert.match(selector, /onMarkOpenChat\?\(\)/);
  const consumedAt = selector.indexOf("if markOpenChatConsumed");
  const setAt = selector.indexOf("markOpenChatConsumed = true");
  const fireAt = selector.indexOf("onMarkOpenChat?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /markOpenChatConsumed/);
  assert.match(composer, /keyboardU/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const readFn = sliceFn(model, "func toggleChatRead(_ id: String)", "func retainChatPins");
  assert.match(readFn, /chatUnread\.mark\(id\)/);
  assert.match(readFn, /chatUnread\.clear\(id\)/);
  assert.match(readFn, /unreadChannelIDs\.remove\(id\)/);
  assert.match(readFn, /ChatMute\.replyMayMarkUnread/);
  assert.match(readFn, /publishReplyUnread\(\)/);
  const showsAt = readFn.indexOf("shows");
  const muteAt = readFn.indexOf("replyMayMarkUnread");
  const markAt = readFn.indexOf("chatUnread.mark");
  assert.ok(showsAt >= 0 && muteAt > showsAt && markAt > muteAt);
  assert.match(model, /func loadConversation/);
  assert.match(model, /clearReplyUnread\(id\)/);
  assert.match(list, /model\.toggleChatRead\(agent\.id\)/);

  assert.match(sheet, /MarkOpenChat\.keysLabel/);
  assert.match(sheet, /MarkOpenChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /markOpenChat\.test\.ts/);
  assert.match(ci, /test_ios_mark_open_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.10 /);
  assert.match(roadmap, /mark the open chat unread from the keyboard/);
  assert.match(spec, /## 110\. v1\.10/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
