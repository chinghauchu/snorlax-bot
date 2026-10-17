// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  QUOTE_JUMP_ACTION,
  QUOTE_JUMP_KEY,
  QUOTE_JUMP_KEYS,
  QuoteJumps,
  addQuoteLink,
  isQuoteJumpChord,
  linksStillInContent,
  overlayTextFieldOwnsQuoteJump,
  parseQuoteJumps,
  pickQuoteJumpMessageId,
  primaryQuoteSource,
  quoteBlocks,
  quoteJumpBlocked,
  quoteJumpHighlightAnimates,
  quoteJumpParts,
  quoteJumpShouldMove,
  quoteJumpTargets,
  type QuoteJumpGate,
} from "./quoteJump.ts";
import { userJumpView } from "./userMessageJump.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const src = readFileSync(join(here, "quoteJump.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteJump.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const sheet = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
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

const PHRASE =
  "v1.27 jump from a sent quote to the message it replies to (quoting a user-RIGHT or completed assistant-LEFT kind=message remembers that message locally; after Send, each matching quote block in that user message is a thin control that scrolls to the quoted message; clearing the draft drops the pending link; a sent message that no longer contains the quote does not keep it; Cmd/Ctrl-' jumps to the quoted message for the quote nearest the reading line; a key repeat does not jump again; the composer may keep its text and the apostrophe is not inserted; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; stick-to-bottom, the Jump chip, per-chat reading place, the sticky day header, collapsed long messages, muted chats, and the New messages divider stay; Reduce Motion adds no animation; the shortcuts list includes Cmd/Ctrl ' to jump to the quoted message; iOS hardware command-' and control-' jump the same way and Gestures & shortcuts lists the chord; desktop localStorage and iOS UserDefaults; no new HTTP)";

const openGate: QuoteJumpGate = {
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

test(
  "v1.27 jump from a sent quote to the message it replies to (a sent quote block scrolls back to the message that was quoted; Cmd/Ctrl-' jumps to the one nearest the reading line; local storage only; no new HTTP)",
  () => {
    assert.equal(QUOTE_JUMP_KEYS, "Cmd/Ctrl '");
    assert.equal(QUOTE_JUMP_ACTION, "Jump to the quoted message");
    assert.equal(QUOTE_JUMP_KEY, "snorlax.quoteJumps");
  },
);

test("Cmd/Ctrl-' is the chord; Shift, Alt, and both modifiers are not", () => {
  assert.equal(isQuoteJumpChord({ key: "'", metaKey: true }), true);
  assert.equal(isQuoteJumpChord({ key: "Quote", ctrlKey: true }), true);
  assert.equal(isQuoteJumpChord({ key: "'", metaKey: true, repeat: true }), true);
  assert.equal(isQuoteJumpChord({ key: "'", metaKey: true, shiftKey: true }), false);
  assert.equal(isQuoteJumpChord({ key: "'", metaKey: true, altKey: true }), false);
  assert.equal(isQuoteJumpChord({ key: "'", metaKey: true, ctrlKey: true }), false);
  assert.equal(isQuoteJumpChord({ key: "'", shiftKey: true }), false);
  assert.equal(isQuoteJumpChord({ key: "l", metaKey: true }), false);
  assert.equal(isQuoteJumpChord({ key: "ArrowUp", metaKey: true, shiftKey: true }), false);
  assert.equal(quoteJumpShouldMove({ repeat: false }), true);
  assert.equal(quoteJumpShouldMove({ repeat: true }), false);
});

test("overlays and other text fields keep the chord; the composer does not", () => {
  assert.equal(quoteJumpBlocked(openGate), false);
  assert.equal(overlayTextFieldOwnsQuoteJump(true, true), false);
  assert.equal(overlayTextFieldOwnsQuoteJump(true, false), true);
  assert.equal(overlayTextFieldOwnsQuoteJump(false, false), false);
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
    assert.equal(quoteJumpBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.equal(quoteJumpBlocked({ ...openGate, chatOpen: false }), true);
  assert.equal(quoteJumpHighlightAnimates(false), true);
  assert.equal(quoteJumpHighlightAnimates(true), false);
});

test("quote blocks match a Quote insert and ignore ordinary text", () => {
  assert.deepEqual(quoteBlocks("> hello\n> world\n\nreply"), ["hello\nworld"]);
  assert.deepEqual(quoteBlocks("> one\n\n> two\n"), ["one", "two"]);
  assert.deepEqual(quoteBlocks("no quote"), []);
  assert.deepEqual(quoteBlocks("> \n> kept"), ["kept"]);
  const links = addQuoteLink([], "  hello\nworld  ", "src-1");
  assert.deepEqual(links, [{ text: "hello\nworld", sourceId: "src-1" }]);
  const replaced = addQuoteLink(links, "hello\nworld", "src-2");
  assert.deepEqual(replaced, [{ text: "hello\nworld", sourceId: "src-2" }]);
  assert.deepEqual(addQuoteLink(links, "   ", "src-3"), links);
  assert.deepEqual(addQuoteLink(links, "hello", ""), links);
});

test("Send keeps a quote only while the text and the source are still there", () => {
  const pending = [
    { text: "hello", sourceId: "a" },
    { text: "gone", sourceId: "b" },
  ];
  assert.deepEqual(linksStillInContent("> hello\n\nthanks", pending), [
    { text: "hello", sourceId: "a" },
  ]);
  const loaded = new Set(["a"]);
  assert.deepEqual(
    quoteJumpTargets("> hello\n\nthanks", pending, loaded),
    [{ text: "hello", sourceId: "a" }],
  );
  assert.deepEqual(quoteJumpTargets("> hello", pending, new Set()), []);
  assert.equal(
    primaryQuoteSource([
      { text: "one", sourceId: "a" },
      { text: "two", sourceId: "b" },
    ]),
    "b",
  );
  assert.equal(primaryQuoteSource([]), null);

  const parts = quoteJumpParts("> hello\n\nthanks", [
    { text: "hello", sourceId: "a" },
  ]);
  assert.deepEqual(parts[0], { kind: "quote", text: "hello", sourceId: "a" });
  assert.equal(parts[1]?.kind, "text");
  assert.match(parts[1] && parts[1].kind === "text" ? parts[1].text : "", /thanks/);
  const plain = quoteJumpParts("just text", []);
  assert.deepEqual(plain, [{ kind: "text", text: "just text" }]);
});

test("pending links persist per chat and move onto the sent message", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const jumps = new QuoteJumps(storage);
  jumps.note("agent", null, "hello", "src");
  jumps.note("agent", "thread", "other", "src-2");
  const again = new QuoteJumps(storage);
  again.commit("agent", null, "> hello\n\nreply");
  again.commit("agent", null, "no quote here");
  const loaded = new Set(["src", "src-2"]);
  assert.deepEqual(again.targets("agent", null, "> hello\n\nreply", loaded), [
    { text: "hello", sourceId: "src" },
  ]);
  assert.deepEqual(again.targets("agent", null, "no quote here", loaded), []);
  again.commit("agent", "thread", "> other");
  assert.deepEqual(again.targets("agent", "thread", "> other", loaded), [
    { text: "other", sourceId: "src-2" },
  ]);
  again.clearPending("agent", null);
  const raw = memory.get(QUOTE_JUMP_KEY) ?? "";
  assert.match(raw, /src/);
  assert.deepEqual(parseQuoteJumps("not json"), { pending: {}, sent: {} });
  assert.deepEqual(parseQuoteJumps(null), { pending: {}, sent: {} });
  assert.deepEqual(parseQuoteJumps('{"pending":{"k":[{"text":"","sourceId":"x"}]}}'), {
    pending: {},
    sent: {},
  });
});

test("the keyboard picks the quote under the reading line", () => {
  const view = userJumpView({ scrollTop: 80, stickyInset: 0, maxScroll: 400 });
  const rows = [
    { id: "early", top: 10 },
    { id: "here", top: 80 },
    { id: "later", top: 200 },
  ];
  assert.equal(pickQuoteJumpMessageId(rows, view), "here");
  assert.equal(
    pickQuoteJumpMessageId(
      [
        { id: "below", top: 300 },
        { id: "lower", top: 360 },
      ],
      view,
    ),
    "below",
  );
  assert.equal(pickQuoteJumpMessageId([], view), null);
});

test("the chord is listed and wired without a new route", () => {
  const row = CHAT_SHORTCUTS.find((item) => item.id === "quote-jump");
  assert.equal(row?.keys, QUOTE_JUMP_KEYS);
  assert.equal(row?.action, QUOTE_JUMP_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl-'/);
  assert.match(app, /isQuoteJumpChord/);
  assert.match(app, /quoteJumpBlocked/);
  assert.match(app, /pickQuoteJumpMessageId/);
  assert.match(app, /className="quote-jump"/);
  assert.match(app, /data-quote-jump-target/);
  assert.match(app, /data-quote-id/);
  assert.match(app, /quoteJumps\.current\.note/);
  assert.match(app, /quoteJumps\.current\.commit/);
  assert.match(app, /clearPending/);
  assert.match(css, /\.quote-jump/);
  assert.match(css, /data-quote-jump-highlight/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*data-quote-jump-highlight[\s\S]*animation:\s*none/,
  );
  assert.doesNotMatch(src, /@keyframes/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /static let storageKey = "snorlax.quoteJumps"/);
  assert.match(swift, /Jump to the quoted message/);
  assert.match(swift, /command-'/);
  assert.match(sheet, /QuoteJump\.keysLabel/);
  assert.match(sheet, /QuoteJump\.action/);
  assert.match(chat, /applyQuoteJump/);
  assert.match(chat, /quoteJumpKey/);
  assert.match(model, /quoteJumps\.note/);
  assert.match(model, /quoteJumps\.commit/);
  assert.match(model, /quoteJumps\.clearPending/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /quoteJump\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.27 /);
  assert.match(spec, /## 127\. v1\.27/);
  assert.match(ci, /test_ios_quote_jump\.py/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.match(app, /newMessages/);
  assert.match(app, /chatMute/);
});
