// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { collapsedToolsLabel } from "./compactToolTraces.ts";
import {
  COPY_LAST_REPLY_ACTION,
  COPY_LAST_REPLY_KEYS,
  copyLastReplyBlocked,
  isCopyLastReplyChord,
  lastAssistantReply,
} from "./copyLastReply.ts";
import { MESSAGE_COPY_FEEDBACK_MS } from "./messageActions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "copyLastReply.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "CopyLastReply.swift"),
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

const PHRASE =
  "v1.00 copy the last assistant reply (Cmd/Ctrl-Shift-C copies the latest completed assistant LEFT kind=message, the same text as Copy; a reply still streaming is skipped; an empty reply copies nothing; muted Copied sits beside that Copy for 1.2s; the composer may stay focused; plain Cmd/Ctrl-C still copies a selection; find, the quick switcher, the shortcuts list, rename, the lightbox, and a focused widget, approve, or connect card stay; IME stays; nothing is sent; the shortcuts list includes Cmd/Ctrl Shift C; iOS hardware command-shift-C copies that reply and is listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  chatOpen: true,
  composing: false,
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

test("Cmd/Ctrl-Shift-C copies; plain Cmd-C and other chords do not", () => {
  assert.equal(isCopyLastReplyChord({ key: "c", metaKey: true, shiftKey: true }), true);
  assert.equal(isCopyLastReplyChord({ key: "C", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isCopyLastReplyChord({ key: "c", metaKey: true }), false);
  assert.equal(isCopyLastReplyChord({ key: "c", ctrlKey: true }), false);
  assert.equal(isCopyLastReplyChord({ key: "c", shiftKey: true }), false);
  assert.equal(isCopyLastReplyChord({ key: "c" }), false);
  assert.equal(
    isCopyLastReplyChord({ key: "c", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(
    isCopyLastReplyChord({ key: "c", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isCopyLastReplyChord({ key: "c", metaKey: true, shiftKey: true, repeat: true }),
    false,
  );
  assert.equal(isCopyLastReplyChord({ key: "l", metaKey: true, shiftKey: true }), false);
  assert.equal(isCopyLastReplyChord({ key: "c", metaKey: true, shiftKey: false }), false);
  assert.equal(isCopyLastReplyChord({ key: "C", metaKey: true, shiftKey: true }), true);
  assert.equal(COPY_LAST_REPLY_KEYS, "Cmd/Ctrl Shift C");
  assert.equal(COPY_LAST_REPLY_ACTION, "Copy the last reply");
  assert.equal(MESSAGE_COPY_FEEDBACK_MS, 1200);
});

test("the latest completed reply is copied; streaming and empty are skipped", () => {
  const messages = [
    { id: "u1", role: "user", senderId: "user", kind: "message", content: "hi" },
    { id: "a1", role: "assistant", senderId: "bot", kind: "message", content: "first" },
    { id: "t1", role: "assistant", senderId: "bot", kind: "tool", content: "Searching…" },
    { id: "a2", role: "assistant", senderId: "bot", kind: "message", content: "second" },
  ];
  assert.equal(
    lastAssistantReply(messages, { busy: false, liveAssistantIdx: -1 })?.id,
    "a2",
  );
  assert.equal(
    lastAssistantReply(messages, { busy: false, liveAssistantIdx: -1 })?.content,
    "second",
  );
  assert.equal(
    lastAssistantReply(messages, { busy: true, liveAssistantIdx: 3 })?.id,
    "a1",
  );
  assert.equal(
    lastAssistantReply(
      [
        { id: "u", role: "user", senderId: "user", kind: "message", content: "hi" },
        { id: "live", role: "assistant", senderId: "bot", kind: "message", content: "partial" },
      ],
      { busy: true, liveAssistantIdx: 1 },
    ),
    null,
  );
  assert.equal(
    lastAssistantReply(
      [
        { id: "a", role: "assistant", senderId: "bot", kind: "message", content: "   " },
        { id: "w", role: "assistant", senderId: "bot", kind: "widget", content: "ask" },
      ],
      { busy: false, liveAssistantIdx: -1 },
    ),
    null,
  );
  assert.equal(
    lastAssistantReply(
      [{ id: "u", role: "user", senderId: "user", kind: "message", content: "only me" }],
      { busy: false, liveAssistantIdx: -1 },
    ),
    null,
  );
  assert.equal(collapsedToolsLabel(3), "3 tools");
});

test("overlays and a card keep the key; the composer does not block it", () => {
  assert.equal(copyLastReplyBlocked(openGate), false);
  for (const flag of [
    "composing",
    "inCard",
    "findOpen",
    "switchOpen",
    "shortcutsOpen",
    "renaming",
    "lightboxOpen",
    "menuOpen",
    "blocked",
  ] as const) {
    assert.equal(copyLastReplyBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.equal(copyLastReplyBlocked({ ...openGate, chatOpen: false }), true);
});

test("desktop wires the chord without sending or editing the draft", () => {
  const block = sliceFn(
    app,
    "const onCopyLastReply",
    'addEventListener("keydown", onCopyLastReply, true)',
  );
  assert.match(block, /isCopyLastReplyChord\(/);
  assert.match(block, /copyLastReplyBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
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
  assert.match(block, /copyLastReplyRef\.current\(\)/);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /typeIntoComposerRef/);

  const paint = sliceFn(app, "copyLastReplyRef.current = () =>", "useEffect(() => {");
  assert.match(paint, /lastAssistantReply\(visibleMessages/);
  assert.match(paint, /copyText\(reply\.content\)/);
  assert.match(paint, /setShortcutCopiedId\(reply\.id\)/);
  assert.match(paint, /MESSAGE_COPY_FEEDBACK_MS/);
  assert.doesNotMatch(paint, /onSend\(/);
  assert.doesNotMatch(paint, /setDraft\(/);

  assert.match(app, /shortcutCopied=\{shortcutCopiedId === message\.id\}/);
  assert.match(app, /copied \|\| shortcutCopied/);
  const row = CHAT_SHORTCUTS.find((item) => item.id === "copy-last");
  assert.ok(row);
  assert.equal(row.keys, COPY_LAST_REPLY_KEYS);
  assert.equal(row.action, COPY_LAST_REPLY_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift C/);
  assert.match(shortcuts, /Copy the last reply/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(readFileSync(join(here, "compactToolTraces.ts"), "utf8"), /N tools/);
});

test("iOS hardware command-shift-C copies; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧C"/);
  assert.match(swift, /static let action = "Copy the last reply"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func lastReply/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func copyLastReplyKey/);
  assert.match(chat, /CopyLastReply\.isChord/);
  assert.match(chat, /CopyLastReply\.lastReply/);
  assert.match(chat, /UIPasteboard\.general\.string = reply\.content/);
  assert.match(chat, /copiedReplyId = reply\.id/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /shortcutCopied: message\.id == copiedReplyId/);
  assert.match(chat, /copied \|\| shortcutCopied/);
  assert.doesNotMatch(
    sliceFn(chat, "func copyLastAssistantReply", "private func openFind"),
    /model\.send\(/,
  );
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const commands = sliceFn(composer, "func copyLastReplyCommands", "func chatNavCommands");
  assert.match(commands, /input: "c"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(composer, /func copyLastReplyFromShortcut/);
  assert.match(composer, /markedTextRange != nil/);
  assert.match(composer, /onCopyLastReply\?\(\)/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(composer, /computerPane\.ts/);

  assert.match(sheet, /CopyLastReply\.keysLabel/);
  assert.match(sheet, /CopyLastReply\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /copyLastReply\.test\.ts/);
  assert.match(ci, /test_ios_copy_last_reply\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.00 /);
  assert.match(roadmap, /copy the last assistant reply(?:\)| \+)/);
  assert.match(spec, /## 100\. v1\.00/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
