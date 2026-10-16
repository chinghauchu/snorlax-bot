// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { isFocusComposerChord } from "./focusComposerKey.ts";
import { appendQuoteToDraft } from "./quoteSelection.ts";
import {
  QUOTE_SELECTION_ACTION,
  QUOTE_SELECTION_KEYS,
  isQuoteSelectionChord,
  quoteSelectionBlocked,
  selectionToQuote,
  type QuoteSelectionGate,
} from "./quoteSelectionKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "quoteSelectionKey.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
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
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSelectionKey.swift"),
  "utf8",
);
const quoteSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSelection.swift"),
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

const PHRASE =
  "v1.26 quote a transcript selection from the keyboard (Cmd/Ctrl-L, when the selection sits in one user-RIGHT or completed assistant-LEFT kind=message, inserts it as a markdown quote in the composer, leaves the caret after the quote, and focuses the composer; it does not send; an existing draft is kept and the quote is appended after a blank line; an empty or whitespace-only selection does nothing and Cmd/Ctrl-L still only focuses the composer; a selection in the composer is not quoted and the caret stays; a key repeat does not quote again; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; tool lines, widgets, approve cards, connect cards, file chips, and a streaming LEFT bubble stay unquotable; stick-to-bottom, the Jump chip, per-chat reading place, the sticky day header, and collapsed long messages stay; Reduce Motion adds no animation; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, and the other chords stay; the shortcuts list includes Cmd/Ctrl L to quote the selection; iOS hardware command-L and control-L quote a transcript selection the same way and Gestures & shortcuts lists the chord; no new HTTP)";

const openGate: QuoteSelectionGate = {
  chatOpen: true,
  editable: true,
  composing: false,
  inTextField: false,
  inCard: false,
  findOpen: false,
  switchOpen: false,
  shortcutsOpen: false,
  renaming: false,
  lightboxOpen: false,
  menuOpen: false,
  blocked: false,
};

test(PHRASE, () => {
  assert.match(src, /v1\.26/);
  assert.match(src, /No HTTP/);
  assert.equal(QUOTE_SELECTION_KEYS, "Cmd/Ctrl L");
  assert.equal(QUOTE_SELECTION_ACTION, "Quote the selection");
});

test("Cmd/Ctrl-L quotes; Shift, Alt, repeat, and other chords do not", () => {
  assert.equal(isQuoteSelectionChord({ key: "l", metaKey: true }), true);
  assert.equal(isQuoteSelectionChord({ key: "L", ctrlKey: true }), true);
  assert.equal(
    isQuoteSelectionChord({ key: "l", metaKey: true }),
    isFocusComposerChord({ key: "l", metaKey: true }),
  );
  assert.equal(isQuoteSelectionChord({ key: "l", metaKey: true, shiftKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "l", ctrlKey: true, altKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "l", metaKey: true, ctrlKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "l", metaKey: true, repeat: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "l" }), false);
  assert.equal(isQuoteSelectionChord({ key: "PageUp" }), false);
  assert.equal(isQuoteSelectionChord({ key: "PageDown" }), false);
  assert.equal(isQuoteSelectionChord({ key: "Home", metaKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "End", ctrlKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "ArrowUp" }), false);
  assert.equal(isQuoteSelectionChord({ key: "ArrowUp", metaKey: true, shiftKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "k", metaKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "f", metaKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "n", metaKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isQuoteSelectionChord({ key: "Escape" }), false);
});

test("a transcript selection quotes; a text field, empty text, and overlays do not", () => {
  assert.equal(selectionToQuote({ inTextField: false, selection: "hello" }), "hello");
  assert.equal(selectionToQuote({ inTextField: false, selection: "  hello \n" }), "hello");
  assert.equal(selectionToQuote({ inTextField: true, selection: "hello" }), null);
  assert.equal(selectionToQuote({ inTextField: false, selection: null }), null);
  assert.equal(selectionToQuote({ inTextField: false, selection: "  \n" }), null);
  assert.equal(selectionToQuote({ inTextField: false, selection: "" }), null);
  const kept = appendQuoteToDraft("draft", "hello");
  assert.equal(kept?.text, "draft\n\n> hello\n\n");
  assert.equal(appendQuoteToDraft("", "hello")?.text, "> hello\n\n");

  assert.equal(quoteSelectionBlocked(openGate), false);
  assert.equal(quoteSelectionBlocked({ ...openGate, inTextField: true }), false);
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
    assert.equal(quoteSelectionBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.equal(quoteSelectionBlocked({ ...openGate, chatOpen: false }), true);
  assert.equal(quoteSelectionBlocked({ ...openGate, editable: false }), true);
});

test("the chord is wired, listed, and does not scroll or send", () => {
  const row = CHAT_SHORTCUTS.find((item) => item.id === "quote-selection");
  assert.equal(row?.keys, QUOTE_SELECTION_KEYS);
  assert.equal(row?.action, QUOTE_SELECTION_ACTION);
  assert.match(shortcuts, /v1\.26/);
  const start = app.indexOf("const onFocusComposerKey");
  const end = app.indexOf('addEventListener("keydown", onFocusComposerKey, true)');
  assert.ok(start >= 0 && end > start);
  const handler = app.slice(start, end);
  assert.match(handler, /quoteSelectionBlocked\(gate\)/);
  assert.match(handler, /selectionToQuote\(/);
  assert.match(handler, /readQuoteOffer\(\)/);
  assert.match(handler, /quoteKeyRef\.current\(quoted\)/);
  assert.match(app, /quoteKeyRef\.current = quoteIntoComposer/);
  assert.ok(handler.indexOf("quoteSelectionBlocked") < handler.indexOf("preventDefault"));
  assert.ok(handler.indexOf("selectionToQuote") < handler.indexOf("quoteKeyRef.current"));
  assert.doesNotMatch(handler, /onSend\(/);
  assert.doesNotMatch(handler, /onUserScroll/);
  assert.doesNotMatch(handler, /Show more/);
  assert.doesNotMatch(handler, /setStick\(/);
  assert.doesNotMatch(src, /@keyframes/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /src\/quoteSelectionKey\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.26 /);
  assert.match(spec, /## 126\. v1\.26/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_quote_selection_key\.py/);
  assert.match(swift, /static let action = "Quote the selection"/);
  assert.match(swift, /static func selectionToQuote/);
  assert.match(swift, /static func claimTurn/);
  assert.match(swift, /No HTTP/);
  assert.match(quoteSwift, /quoteSelectionFromHardware/);
  assert.match(quoteSwift, /quoteHold/);
  assert.match(quoteSwift, /clearActiveSelection/);
  assert.match(chat, /func quoteSelectionFromChord/);
  assert.match(chat, /QuoteSelectionKey.selectionToQuote/);
  assert.match(chat, /QuoteSelectionKey.claimTurn/);
  assert.match(chat, /quoteChordBlocked/);
  assert.match(sheet, /QuoteSelectionKey.action/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(chat, /computerPane\.ts/);
});
