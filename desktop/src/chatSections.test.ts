// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PINNED_GROUP_LABEL } from "./chatPins.ts";
import {
  CHATS_SECTION_LABEL,
  rosterSectionHeaders,
  rosterSectionLabel,
  sectionHasRows,
} from "./chatSections.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatSections.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatSections.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);

const PHRASE =
  "v0.97 sidebar section headers (muted section headers group the sidebar and the iOS chat list; the existing Pinned header stays when that group has rows; unpinned chats sit under a Chats header; an empty group hides its header; All / Unread, the archive list, pin order, Draft: preview, generating ···, relative time, the unread dot, rename, and Alt+Up/Down visible order stay; the archive list keeps Archived and does not grow a Chats header; Reduce Motion adds no animation; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("empty groups hide their header and Chats follows Pinned", () => {
  assert.equal(sectionHasRows(0), false);
  assert.equal(sectionHasRows(-1), false);
  assert.equal(sectionHasRows(Number.NaN), false);
  assert.equal(sectionHasRows(Number.POSITIVE_INFINITY), false);
  assert.equal(sectionHasRows(1), true);

  assert.deepEqual(rosterSectionHeaders(0, 0), []);
  assert.deepEqual(rosterSectionHeaders(2, 0), ["pinned"]);
  assert.deepEqual(rosterSectionHeaders(0, 3), ["chats"]);
  assert.deepEqual(rosterSectionHeaders(1, 4), ["pinned", "chats"]);
  assert.deepEqual(rosterSectionHeaders(-2, Number.NaN), []);

  assert.equal(rosterSectionLabel("pinned"), PINNED_GROUP_LABEL);
  assert.equal(rosterSectionLabel("pinned"), "Pinned");
  assert.equal(rosterSectionLabel("chats"), CHATS_SECTION_LABEL);
  assert.equal(CHATS_SECTION_LABEL, "Chats");
});

test("sidebar paints muted headers without touching row order or archive", () => {
  const group = block(".roster-group");
  assert.match(group, /font-size:\s*12px/);
  assert.match(group, /color:\s*var\(--text-muted\)/);
  assert.match(group, /font-weight:\s*500/);
  assert.doesNotMatch(group, /animation/);
  assert.doesNotMatch(group, /transition/);
  const later = block(".roster li + li.roster-group");
  assert.match(later, /margin-top:\s*8px/);
  assert.doesNotMatch(later, /animation/);
  assert.doesNotMatch(later, /transition/);

  assert.match(app, /from "\.\/chatSections"/);
  assert.match(
    app,
    /rosterSectionHeaders\(\s*pinnedAgents\.length,\s*restAgents\.length,\s*\)/,
  );
  assert.match(app, /className="roster-group">\{PINNED_GROUP_LABEL\}/);
  assert.match(app, /className="roster-group">\{CHATS_SECTION_LABEL\}/);
  assert.match(app, /rosterHeaders\.includes\("pinned"\)/);
  assert.match(app, /rosterHeaders\.includes\("chats"\)/);
  assert.match(app, /pinnedAgents\.map\(\(agent\) => renderChatRow\(agent, false\)\)/);
  assert.match(app, /restAgents\.map\(\(agent\) => renderChatRow\(agent, false\)\)/);

  const roster = app.split('<ul className="roster">', 2)[1]?.split("</ul>", 1)[0] ?? "";
  const pinnedAt = roster.indexOf('includes("pinned")');
  const chatsAt = roster.indexOf('includes("chats")');
  const pinnedRows = roster.indexOf("pinnedAgents.map");
  const restRows = roster.indexOf("restAgents.map");
  assert.ok(pinnedAt >= 0 && pinnedAt < pinnedRows);
  assert.ok(pinnedRows < chatsAt && chatsAt < restRows);

  assert.match(app, /\[\.\.\.pinnedAgents, \.\.\.restAgents\]/);
  assert.match(app, /className="row-preview"/);
  assert.match(app, /className="row-draft-prefix"/);
  assert.match(app, /className="row-generating waiting-dots"/);
  assert.match(app, /className="row-time"/);
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.match(app, /aria-label=\{RENAME_LABEL\}/);
  assert.match(app, /className="roster-archive-list"/);
  const archiveList =
    app.split('className="roster-archive-list"', 2)[1]?.split("</ul>", 1)[0] ?? "";
  assert.doesNotMatch(archiveList, /CHATS_SECTION_LABEL|roster-group/);
  assert.match(archiveList, /renderChatRow\(agent, true\)/);

  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let chatsLabel = "Chats"/);
  assert.match(swift, /count > 0/);
  assert.match(swift, /ChatPins\.groupLabel/);
  assert.match(swift, /headers\.append\(chatsLabel\)/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatSections\.labels\(/);
  assert.match(list, /headers\.contains\(ChatPins\.groupLabel\)/);
  assert.match(list, /headers\.contains\(ChatSections\.chatsLabel\)/);
  assert.match(list, /Text\(ChatSections\.chatsLabel\)/);
  assert.match(list, /Text\(ChatPins\.groupLabel\)/);
  assert.match(list, /Text\(ChatArchive\.sectionLabel\)/);
  assert.match(list, /ChatArchive\.sectionTitle/);
  assert.match(list, /model\.chatListPreview\(/);
  assert.match(list, /GeneratingDots\(\)/);
  assert.match(list, /ChatListTime\.label\(/);
  assert.match(list, /accessibilityLabel\("Unread"\)/);
  assert.doesNotMatch(list, /withAnimation/);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatSections\.test\.ts/);
  assert.match(ci, /test_ios_chat_sections\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.97 /);
  assert.match(roadmap, /sidebar section headers(?:\)| \+)/);
  assert.match(spec, /## 98\. v0\.97/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
