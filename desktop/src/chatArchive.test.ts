// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ARCHIVE_LABEL,
  ARCHIVED_SECTION_LABEL,
  CHAT_ARCHIVES_KEY,
  UNARCHIVE_LABEL,
  archiveChat,
  archivedSectionLabel,
  excludeArchived,
  isChatArchived,
  parseChatArchives,
  readChatArchives,
  retainChatArchives,
  selectionAfterArchive,
  serializeChatArchives,
  unarchiveChat,
  writeChatArchives,
  type ArchiveStorage,
} from "./chatArchive.ts";
import { FILTER_UNREAD, rosterForFilter } from "./chatListFilter.ts";
import { groupPinnedChats } from "./chatPins.ts";
import { adjacentChatId } from "./chatNav.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatArchive.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatArchive.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);

const PHRASE =
  "v0.96 archive a chat from the sidebar (right-click a sidebar chat row offers Archive in the menu with Pin, Rename, and Mark unread; the chat leaves the main list immediately; a muted Archived (n) toggle at the bottom of the sidebar shows archived chats and Unarchive puts one back in pin and recency order; if the open chat is archived, the next chat in Alt+Up/Down order opens, or the empty state; iOS swipe and long-press offer Archive, and an Archived list offers Unarchive; archive persists in local storage / UserDefaults; a new message in an archived chat stays archived and still marks unread; Pin is hidden in the archived list and the pin is kept for Unarchive; Unread-only skips archived chats; Alt+Up/Down skips archived chats; the quick switcher and iOS name search still find archived chats; Reduce Motion adds no animation; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

class MemoryStorage implements ArchiveStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const rows = [
  { id: "a", unread: false },
  { id: "b", unread: true },
  { id: "c", unread: true },
  { id: "d", unread: false },
];

test("archive appends, unarchive removes, and a bad blob is empty", () => {
  assert.equal(ARCHIVE_LABEL, "Archive");
  assert.equal(UNARCHIVE_LABEL, "Unarchive");
  assert.equal(ARCHIVED_SECTION_LABEL, "Archived");
  assert.equal(CHAT_ARCHIVES_KEY, "snorlax.chatArchives");
  assert.equal(archivedSectionLabel(2), "Archived (2)");
  assert.equal(archivedSectionLabel(0), "Archived (0)");

  assert.deepEqual(parseChatArchives(null), []);
  assert.deepEqual(parseChatArchives(undefined), []);
  assert.deepEqual(parseChatArchives(""), []);
  assert.deepEqual(parseChatArchives("nope"), []);
  assert.deepEqual(parseChatArchives("{}"), []);
  assert.deepEqual(parseChatArchives('[1, "", "a", "a", "b"]'), ["a", "b"]);
  assert.equal(serializeChatArchives(["b", "b", "", "a"]), '["b","a"]');

  let ids: string[] = [];
  ids = archiveChat(ids, "b");
  ids = archiveChat(ids, "a");
  ids = archiveChat(ids, "b");
  assert.deepEqual(ids, ["b", "a"]);
  assert.equal(isChatArchived(ids, "a"), true);
  assert.equal(isChatArchived(ids, "c"), false);
  assert.equal(isChatArchived(ids, ""), false);
  assert.deepEqual(archiveChat(ids, ""), ids);
  ids = unarchiveChat(ids, "b");
  assert.deepEqual(ids, ["a"]);
  assert.deepEqual(unarchiveChat(ids, "missing"), ids);
  assert.deepEqual(unarchiveChat(ids, ""), ids);
  assert.deepEqual(retainChatArchives(["a", "gone", "b"], new Set(["b"])), ["b"]);
  assert.deepEqual(retainChatArchives(["gone"], new Set()), []);
});

test("the main list drops archived chats; unarchive restores pin order", () => {
  const archived = archiveChat(archiveChat([], "a"), "c");
  const live = excludeArchived(rows, archived, (row) => row.id);
  assert.deepEqual(
    live.map((row) => row.id),
    ["b", "d"],
  );
  const pins = ["c", "a"];
  const grouped = groupPinnedChats(live, pins, (row) => row.id);
  assert.deepEqual(
    grouped.pinned.map((row) => row.id),
    [],
  );
  assert.deepEqual(
    grouped.rest.map((row) => row.id),
    ["b", "d"],
  );
  const restored = excludeArchived(rows, unarchiveChat(archived, "a"), (row) => row.id);
  const back = groupPinnedChats(restored, pins, (row) => row.id);
  assert.deepEqual(
    back.pinned.map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(
    [...back.pinned, ...back.rest].map((row) => row.id),
    ["a", "b", "d"],
  );
  const unread = rosterForFilter(live, FILTER_UNREAD, (row) => row.unread);
  assert.deepEqual(
    unread.map((row) => row.id),
    ["b"],
  );
});

test("archiving the open chat opens the next visible row, or empties", () => {
  const visible = ["c", "a", "b", "d"];
  assert.equal(selectionAfterArchive(visible, "a", "a"), "b");
  assert.equal(selectionAfterArchive(visible, "d", "d"), null);
  assert.equal(selectionAfterArchive(visible, "b", "a"), "b");
  assert.equal(selectionAfterArchive(visible, null, "a"), null);
  assert.equal(selectionAfterArchive(visible, "a", ""), "a");
  assert.equal(selectionAfterArchive(visible, "missing", "missing"), null);
  assert.equal(
    selectionAfterArchive(visible, "a", "a"),
    adjacentChatId(visible, "a", 1),
  );
  const without = visible.filter((id) => id !== "a");
  assert.equal(without.includes("a"), false);
  assert.equal(adjacentChatId(without, "c", 1), "b");
});

test("storage survives a relaunch and ignores a thrown store", () => {
  const memory = new MemoryStorage();
  assert.deepEqual(readChatArchives(memory), []);
  writeChatArchives(memory, ["b", "b", "", "a"]);
  assert.equal(memory.getItem(CHAT_ARCHIVES_KEY), '["b","a"]');
  assert.deepEqual(readChatArchives(memory), ["b", "a"]);
  memory.setItem(CHAT_ARCHIVES_KEY, "nope");
  assert.deepEqual(readChatArchives(memory), []);
  assert.deepEqual(readChatArchives(null), []);
  writeChatArchives(null, ["a"]);

  const boom: ArchiveStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  assert.deepEqual(readChatArchives(boom), []);
  writeChatArchives(boom, ["a"]);
});

test("sidebar archive leaves the switcher, unread mark, and motion alone", () => {
  const toggle = block(".roster-archive-toggle");
  assert.match(toggle, /color:\s*var\(--text-muted\)/);
  assert.match(toggle, /font-size:\s*12px/);
  assert.doesNotMatch(toggle, /transition/);
  assert.doesNotMatch(toggle, /animation/);
  const section = block(".roster-archive");
  assert.match(section, /border-top/);
  assert.doesNotMatch(section, /transition/);
  assert.doesNotMatch(section, /animation/);
  const hover = block(".row:hover .row-unarchive");
  assert.match(hover, /opacity:\s*1/);
  assert.doesNotMatch(hover, /transition/);
  const glyph = block(".archive-glyph");
  assert.match(glyph, /width:\s*12px/);
  assert.match(glyph, /height:\s*12px/);

  assert.match(app, /from "\.\/chatArchive"/);
  assert.match(app, /aria-label=\{ARCHIVE_LABEL\}/);
  assert.match(app, /aria-label=\{UNARCHIVE_LABEL\}/);
  assert.match(app, /aria-expanded=\{archiveOpen\}/);
  assert.match(app, /className="roster-archive-toggle"/);
  assert.match(app, /className="row-unarchive"/);
  assert.match(app, /onArchive\(contextMenu\.agent\.id\)/);
  assert.match(app, /onUnarchive\(contextMenu\.agent\.id\)/);
  assert.match(app, /isChatArchived\(archivedChatIds, contextMenu\.agent\.id\)/);
  assert.match(app, /!isChatArchived\(archivedChatIds, agent\.id\)/);
  assert.match(app, /groupPinnedChats\(\s*rosterAgents/);
  assert.match(app, /selectionAfterArchive\(visibleIds, activeId, id\)/);
  assert.match(app, /readChatArchives\(browserArchiveStorage\(\)\)/);
  assert.match(app, /writeChatArchives\(browserArchiveStorage\(\), next\)/);
  assert.match(app, /retainArchives\(rosterIds\)/);
  assert.match(
    app,
    /filterChats\(\s*agents\.map\(\(agent\) => \(\{\s*id: agent\.id,/,
  );
  assert.doesNotMatch(app, /filterChats\(\s*rosterAgents/);
  assert.match(app, /pinActionLabel\(isChatPinned\(pinnedChatIds, contextMenu\.agent\.id\)\)/);
  assert.match(app, /\{RENAME_LABEL\}/);
  assert.match(app, /onClick=\{\(\) => onToggleRead\(contextMenu\.agent\.id\)\}/);

  const note = sliceFn(app, "function noteReplyUnread(", "function clearReplyUnread(");
  assert.match(note, /replyMarksUnread\(/);
  assert.doesNotMatch(note, /archiveChat|unarchiveChat|setArchivedChatIds/);

  const archiveFn = sliceFn(app, "function onArchive(", "function onUnarchive(");
  assert.match(archiveFn, /selectionAfterArchive\(/);
  assert.doesNotMatch(archiveFn, /toggleChatPin/);
  assert.doesNotMatch(archiveFn, /fetch\(/);

  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let storageKey = "snorlax.chatArchives"/);
  assert.match(swift, /static let archiveLabel = "Archive"/);
  assert.match(swift, /static let unarchiveLabel = "Unarchive"/);
  assert.match(swift, /static let sectionLabel = "Archived"/);
  assert.match(swift, /ChatNav\.adjacent/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatArchive\.archiveLabel/);
  assert.match(list, /ChatArchive\.unarchiveLabel/);
  assert.match(list, /ChatArchive\.sectionTitle/);
  assert.match(list, /accessibilityLabel\("Back to chats"\)/);
  assert.match(list, /accessibilityLabel\(ChatArchive\.sectionTitle/);
  assert.match(list, /model\.archiveChat\(agent\.id\)/);
  assert.match(list, /model\.unarchiveChat\(agent\.id\)/);
  assert.match(list, /showsPinGlyph: !archived/);
  assert.match(list, /swipeActions\(edge: \.leading/);
  assert.match(list, /swipeActions\(edge: \.trailing/);
  assert.match(list, /ChatSwitcher\.filter/);
  assert.match(list, /filteredAgents\.map/);
  assert.match(model, /var archivedChatIDs: \[String\]/);
  assert.match(model, /ChatArchive\.read\(\)/);
  assert.match(model, /ChatArchive\.write\(archivedChatIDs\)/);
  assert.match(model, /func archiveChat\(_ id: String\)/);
  assert.match(model, /func unarchiveChat\(_ id: String\)/);
  assert.match(model, /ChatArchive\.selectionAfterArchive/);
  assert.match(model, /!isChatArchived\(\$0\.id\)/);
  assert.match(model, /retainChatArchives\(against:/);
  const reply = sliceFn(
    model,
    "private func noteFinishedAssistantReply",
    "private func handle",
  );
  assert.match(reply, /replyMarksUnread/);
  assert.doesNotMatch(reply, /unarchiveChat|archiveChat/);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatArchive\.test\.ts/);
  assert.match(ci, /test_ios_chat_archive\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.96 /);
  assert.match(roadmap, /archive a chat from the sidebar/);
  assert.match(spec, /## 97\. v0\.96/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
