// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  QUOTE_LABEL,
  appendQuoteToDraft,
  quoteBlock,
  quoteButtonOrigin,
  quoteSurfaceAllowed,
  quoteableText,
  selectionInsideOneQuoteRoot,
} from "./quoteSelection.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "quoteSelection.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSelection.swift"),
  "utf8",
);
const plain = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MidStreamPlaintext.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const shortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);
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

const PHRASE =
  "v0.94 quote selection into the composer (select text in a user-RIGHT or assistant-LEFT kind=message bubble to show a small muted Quote control; desktop places it near the selection; iOS long-press menu includes Quote when there is a selection, and the selection menu offers Quote; activating Quote inserts greater-than lines into the composer, puts the caret after the quote, and focuses the composer; it does not send; an empty or whitespace-only selection does nothing; an existing draft is kept and the quote is appended after a blank line; tool lines, widget, approve, and connect cards, and file chips are not quotable; a streaming LEFT bubble is not quotable; Reduce Motion adds no animation; no new HTTP)";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("empty and whitespace selections do nothing; a real selection becomes > lines", () => {
  assert.equal(quoteableText(""), null);
  assert.equal(quoteableText("   \n\t"), null);
  assert.equal(quoteableText("\u00a0"), null);
  assert.equal(quoteBlock("  "), null);
  assert.equal(appendQuoteToDraft("keep me", "  \n"), null);
  assert.equal(quoteableText("  hello \n"), "hello");
  assert.equal(quoteBlock("hello"), "> hello");
  assert.equal(quoteBlock("a\n\nb"), "> a\n>\n> b");
  assert.equal(quoteBlock("  code\n  next"), "> code\n>   next");
  assert.equal(QUOTE_LABEL, "Quote");
});

test("quote appends after a blank line and leaves an existing draft", () => {
  const fresh = appendQuoteToDraft("", "hello");
  assert.deepEqual(fresh, { text: "> hello\n\n", caret: "> hello\n\n".length });
  assert.equal(appendQuoteToDraft("   \n", "hello")?.text, "> hello\n\n");
  const kept = appendQuoteToDraft("hi", "hello");
  assert.ok(kept);
  assert.equal(kept.text, "hi\n\n> hello\n\n");
  assert.equal(kept.caret, kept.text.length);
  assert.ok(kept.text.startsWith("hi\n\n"));
  assert.equal(appendQuoteToDraft("hi\n\n\n", "a\nb")?.text, "hi\n\n> a\n> b\n\n");
  const spaced = appendQuoteToDraft("  keep  ", "line");
  assert.equal(spaced?.text, "  keep\n\n> line\n\n");
});

test("only user-RIGHT and completed LEFT kind=message are quotable", () => {
  assert.equal(
    quoteSurfaceAllowed({ kind: "message", fromUser: true, completed: true }),
    true,
  );
  assert.equal(
    quoteSurfaceAllowed({ kind: "message", fromUser: true, completed: false }),
    true,
  );
  assert.equal(
    quoteSurfaceAllowed({ kind: "message", fromUser: false, completed: true }),
    true,
  );
  assert.equal(
    quoteSurfaceAllowed({ kind: "message", fromUser: false, completed: false }),
    false,
  );
  for (const kind of ["tool", "widget", "approve", "connect", "handoff"]) {
    assert.equal(
      quoteSurfaceAllowed({ kind, fromUser: false, completed: true }),
      false,
      kind,
    );
    assert.equal(
      quoteSurfaceAllowed({ kind, fromUser: true, completed: true }),
      false,
      kind,
    );
  }
  assert.equal(
    quoteSurfaceAllowed({
      kind: "message",
      fromUser: true,
      completed: true,
      fileChip: true,
    }),
    false,
  );
  assert.equal(
    selectionInsideOneQuoteRoot({
      anchorInRoot: true,
      focusInRoot: true,
      sameRoot: true,
    }),
    true,
  );
  assert.equal(
    selectionInsideOneQuoteRoot({
      anchorInRoot: true,
      focusInRoot: true,
      sameRoot: false,
    }),
    false,
  );
  assert.equal(
    selectionInsideOneQuoteRoot({
      anchorInRoot: false,
      focusInRoot: true,
      sameRoot: true,
    }),
    false,
  );
});

test("Quote sits near the selection and stays inside the viewport", () => {
  assert.deepEqual(
    quoteButtonOrigin(
      { top: 80, left: 40, bottom: 100 },
      { width: 800, height: 600 },
    ),
    { top: 52, left: 40 },
  );
  const below = quoteButtonOrigin(
    { top: 2, left: 10, bottom: 20 },
    { width: 800, height: 600 },
  );
  assert.equal(below.top, 26);
  const clamped = quoteButtonOrigin(
    { top: 40, left: 790, bottom: 60 },
    { width: 800, height: 600 },
  );
  assert.ok(clamped.left >= 8);
  assert.ok(clamped.left + 56 <= 792);
});

test("desktop Quote is near the selection and writes the draft without sending", () => {
  const control = sliceFn(app, "function QuoteSelectionButton(", "function MessageActions(");
  assert.match(control, /className="quote-selection"/);
  assert.match(control, /QUOTE_LABEL/);
  assert.match(control, /readQuoteOffer\(\)/);
  assert.match(control, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(control, /onClick=\{\(\) => onQuote\(offer\.text\)\}/);
  assert.doesNotMatch(control, /onSend/);
  assert.doesNotMatch(control, /transition/);

  const offer = sliceFn(app, "function readQuoteOffer(", "function QuoteSelectionButton(");
  assert.match(offer, /quoteableText\(/);
  assert.match(offer, /quoteRootOf\(selection\.anchorNode\)/);
  assert.match(offer, /quoteRootOf\(selection\.focusNode\)/);
  assert.match(offer, /anchor !== focus/);
  assert.match(offer, /quoteButtonOrigin\(/);

  const insert = sliceFn(app, "function quoteIntoComposer(", "function clearRecalledDraft(");
  assert.match(insert, /appendQuoteToDraft\(draftRef\.current, selection\)/);
  assert.match(insert, /if \(!next\) return/);
  assert.match(insert, /pendingCaret\.current = next\.caret/);
  assert.match(insert, /draftRef\.current = next\.text/);
  assert.match(insert, /setDraft\(next\.text\)/);
  assert.match(insert, /recallArmedAfterEdit\(next\.text, armed\)/);
  assert.match(insert, /removeAllRanges\(\)/);
  assert.match(insert, /if \(takeoverOpen\) return/);
  assert.doesNotMatch(insert, /onSend/);
  assert.doesNotMatch(insert, /fetch\(/);
  assert.doesNotMatch(insert, /\/v1\//);

  assert.match(app, /<QuoteSelectionButton/);
  assert.match(app, /onQuote=\{quoteIntoComposer\}/);
  assert.match(app, /fromUser: true/);
  assert.match(app, /fromUser: false/);
  assert.match(app, /quoteRootAttr\(/);
  const user = sliceFn(app, 'className="bubble user"', "assistant-md");
  assert.match(user, /<pre>/);
  assert.match(user, /quoteRootAttr\(\{/);
  assert.match(user, /fromUser: true/);
  assert.doesNotMatch(
    sliceFn(user, "<MessageAttachmentChrome", "message.content"),
    /data-quote/,
  );
  const assistant = sliceFn(app, 'className="assistant-plain"', "MessageActions");
  assert.match(app, /fromUser: false/);
  assert.match(assistant, /className="assistant-plain"/);
  const tools = sliceFn(app, "isToolLine(message)", "isWidget(message)");
  assert.doesNotMatch(tools, /data-quote/);
  assert.doesNotMatch(tools, /quoteRootAttr/);
  const cards = sliceFn(app, "isWidget(message)", "mine ? (");
  assert.doesNotMatch(cards, /data-quote/);
  assert.doesNotMatch(cards, /quoteIntoComposer/);
  const chips = sliceFn(app, "function MessageAttachmentChrome(", "function ");
  assert.doesNotMatch(chips, /data-quote/);
  assert.doesNotMatch(chips, /quoteRootAttr/);

  const btn = block(".quote-selection");
  assert.match(btn, /position:\s*fixed/);
  assert.match(btn, /font-size:\s*12px/);
  assert.match(btn, /color:\s*var\(--text-muted\)/);
  assert.match(btn, /transition:\s*none/);
  assert.match(btn, /animation:\s*none/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.quote-selection \{\s*transition:\s*none;\s*animation:\s*none;/,
  );
  assert.doesNotMatch(src, /@keyframes/);
  assert.doesNotMatch(css, /@keyframes quote/);
});

test("iOS selection menu and long-press Quote share the same insert", () => {
  assert.match(swift, /static let label = "Quote"/);
  assert.match(swift, /static func append\(draft: String, selection: String\)/);
  assert.match(swift, /static func surfaceAllowed\(/);
  assert.match(swift, /editMenuForTextIn range: NSRange/);
  assert.match(swift, /QuoteSelection\.label/);
  assert.match(swift, /quoteable\(selected\) != nil/);
  assert.match(swift, /range\.length > 0/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(plain, /quoteIntoComposer/);
  assert.doesNotMatch(plain, /QuoteSelectableText/);

  const insert = sliceFn(model, "func quoteIntoComposer(", "func editAsNewMessage(");
  assert.match(insert, /QuoteSelection\.append\(draft: draft, selection: selection\)/);
  assert.match(insert, /guard let next/);
  assert.match(insert, /draft = next\.text/);
  assert.match(insert, /pendingComposerCaret = next\.caret/);
  assert.match(insert, /wantsComposerFocus = true/);
  assert.match(insert, /computerTakeoverOpen/);
  assert.doesNotMatch(insert, /send\(/);
  assert.doesNotMatch(insert, /\/v1\//);

  assert.match(chat, /showQuote: canQuote/);
  assert.match(chat, /QuoteSelection\.surfaceAllowed\(/);
  assert.match(chat, /QuoteSelection\.menuSelection\(\)/);
  assert.match(chat, /Button\(QuoteSelection\.label\)/);
  assert.match(chat, /model\.quoteIntoComposer/);
  assert.match(markdown, /quoteEnabled: completed/);
  assert.match(markdown, /QuoteSelectableText\(/);
  assert.match(shortcuts, /Select text, then Quote/);
  assert.match(shortcuts, /Insert a quote in the composer/);
});

test("OpenAPI stays 0.18.0; roadmap locks v0.94; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.94 /);
  assert.match(spec, /## 95\. v0\.94/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_quote_selection\.py/);
  assert.match(pkg, /quoteSelection\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(chat, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
