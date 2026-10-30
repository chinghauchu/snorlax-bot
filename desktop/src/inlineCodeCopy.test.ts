// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  INLINE_CODE_COPIED_ARIA,
  INLINE_CODE_COPIED_LABEL,
  INLINE_CODE_COPY_ARIA,
  INLINE_CODE_COPY_LABEL,
  INLINE_CODE_COPY_MS,
  INLINE_CODE_MARK,
  INLINE_CODE_MENU_LABEL,
  inlineCodeClipboardText,
  inlineCodeCopyAnimates,
  inlineCodeCopyAriaLabel,
  inlineCodeCopyLabel,
  inlineCodeIsBlock,
  inlineCodeSpanText,
  showInlineCodeCopy,
} from "./inlineCodeCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "inlineCodeCopy.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "InlineCodeCopy.swift"),
  "utf8",
);
const quote = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSelection.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.28 copy inline code";

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

test("clipboard is the span text, not the backticks", () => {
  assert.equal(inlineCodeClipboardText("npm test"), "npm test");
  assert.equal(inlineCodeClipboardText("  keep both  "), "  keep both  ");
  assert.equal(inlineCodeClipboardText("a`b"), "a`b");
  assert.equal(inlineCodeClipboardText(""), "");
  assert.doesNotMatch(inlineCodeClipboardText("npm test"), /^`/);
  assert.doesNotMatch(inlineCodeClipboardText("npm test"), /`$/);
  assert.equal(INLINE_CODE_COPY_MS, 1500);
  assert.equal(INLINE_CODE_COPY_LABEL, "Copy");
  assert.equal(INLINE_CODE_COPIED_LABEL, "Copied");
  assert.equal(inlineCodeCopyLabel(false), "Copy");
  assert.equal(inlineCodeCopyLabel(true), "Copied");
  assert.equal(INLINE_CODE_COPY_ARIA, "Copy inline code");
  assert.equal(INLINE_CODE_COPIED_ARIA, "Copied");
  assert.equal(inlineCodeCopyAriaLabel(false), "Copy inline code");
  assert.equal(inlineCodeCopyAriaLabel(true), "Copied");
  assert.equal(INLINE_CODE_MENU_LABEL, "Copy code");
  assert.equal(INLINE_CODE_MARK, "1");
});

test("Copy is hidden on a fence, while streaming, and when empty", () => {
  assert.equal(inlineCodeIsBlock({ text: "npm test" }), false);
  assert.equal(inlineCodeIsBlock({ className: undefined, text: "npm test" }), false);
  assert.equal(inlineCodeIsBlock({ className: "language-ts", text: "npm test" }), true);
  assert.equal(inlineCodeIsBlock({ className: "language-c++", text: "int x;" }), true);
  assert.equal(inlineCodeIsBlock({ className: "foo language-py bar", text: "x" }), true);
  assert.equal(inlineCodeIsBlock({ text: "line\n" }), true);
  assert.equal(inlineCodeIsBlock({ text: "a\nb" }), true);
  assert.equal(
    showInlineCodeCopy({ completed: true, block: false, text: "npm test" }),
    true,
  );
  assert.equal(
    showInlineCodeCopy({ completed: false, block: false, text: "npm test" }),
    false,
  );
  assert.equal(
    showInlineCodeCopy({ completed: true, block: true, text: "npm test\n" }),
    false,
  );
  assert.equal(showInlineCodeCopy({ completed: true, block: false, text: "" }), false);
  assert.equal(
    showInlineCodeCopy({ completed: true, block: false, text: " " }),
    true,
  );
  assert.equal(inlineCodeCopyAnimates(false), false);
  assert.equal(inlineCodeCopyAnimates(true), false);
  assert.match(src, /Never animate/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /copied \? copiedAria : copyAria/);
  assert.match(swift, /static let menuLabel = "Copy code"/);
  assert.match(swift, /static let copyAria = "Copy inline code"/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});

test("a selection inside one span copies that whole span", () => {
  const spans = [
    { start: 4, end: 12, text: "npm test" },
    { start: 20, end: 23, text: "tsc" },
  ];
  assert.equal(inlineCodeSpanText(spans, { start: 4, end: 12 }), "npm test");
  assert.equal(inlineCodeSpanText(spans, { start: 6, end: 9 }), "npm test");
  assert.equal(inlineCodeSpanText(spans, { start: 21, end: 22 }), "tsc");
  assert.equal(inlineCodeSpanText(spans, { start: 4, end: 13 }), null);
  assert.equal(inlineCodeSpanText(spans, { start: 0, end: 6 }), null);
  assert.equal(inlineCodeSpanText(spans, { start: 12, end: 14 }), null);
  assert.equal(inlineCodeSpanText(spans, { start: 8, end: 8 }), null);
  assert.equal(inlineCodeSpanText(spans, { start: 30, end: 32 }), null);
  assert.equal(
    inlineCodeSpanText([{ start: 0, end: 2, text: "" }], { start: 0, end: 1 }),
    null,
  );
  assert.equal(
    inlineCodeSpanText([{ start: 2, end: 2, text: "x" }], { start: 2, end: 3 }),
    null,
  );
  assert.match(swift, /static func spanText/);
  assert.match(swift, /attributedSubstring\(from: found\)/);
  assert.match(swift, /selEnd > rangeEnd/);
  assert.match(swift, /selection.length <= 0/);
});

test("desktop Copy sits beside the chip and copies the span only", () => {
  const chrome = block(".md-code-inline-copy");
  assert.match(chrome, /position:\s*absolute/);
  assert.match(chrome, /font-size:\s*12px/);
  assert.match(chrome, /color:\s*var\(--text-muted\)/);
  assert.match(chrome, /opacity:\s*0/);
  assert.match(chrome, /pointer-events:\s*none/);
  assert.match(chrome, /user-select:\s*none/);
  assert.match(chrome, /transition:\s*none/);
  assert.match(chrome, /animation:\s*none/);
  assert.match(css, /\.md-code-inline-wrap:hover > \.md-code-inline-copy/);
  assert.match(css, /\.md-code-inline-wrap:focus-within > \.md-code-inline-copy/);
  assert.match(css, /opacity:\s*1/);
  assert.match(css, /pointer-events:\s*auto/);
  const reduceAt = css.indexOf("v2.28: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for inline code Copy");
  const reduce = css.slice(reduceAt, reduceAt + 280);
  assert.match(reduce, /\.md-code-inline-copy/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);

  const inline = sliceFn(body, "function InlineCode(", "function InlineCodeCopyButton(");
  const button = sliceFn(body, "function InlineCodeCopyButton(", "function CodeFence(");
  const fence = sliceFn(body, "function FenceBar(", "function NumberedCode(");
  assert.match(inline, /useContext\(AssistantInlineCodeContext\)/);
  assert.match(inline, /inlineCodeIsBlock\(\{ className, text \}\)/);
  assert.match(inline, /showInlineCodeCopy\(\{ completed, block, text \}\)/);
  assert.match(inline, /className="md-code-inline-wrap"/);
  assert.match(inline, /<code className=\{className\}>\{children\}<\/code>/);
  assert.match(inline, /<InlineCodeCopyButton text=\{inlineCodeClipboardText\(text\)\} \/>/);
  assert.match(inline, /return <code className=\{className\}>\{children\}<\/code>/);
  assert.match(button, /inlineCodeClipboardText\(text\)/);
  assert.match(button, /inlineCodeCopyLabel\(copied\)/);
  assert.match(button, /aria-label=\{inlineCodeCopyAriaLabel\(copied\)\}/);
  assert.match(button, /aria-live="polite"/);
  assert.match(button, /type="button"/);
  assert.match(button, /className="md-code-inline-copy"/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /event\.preventDefault\(\)/);
  assert.match(button, /event\.stopPropagation\(\)/);
  assert.match(button, /INLINE_CODE_COPY_MS/);
  const copyCall = button.slice(button.indexOf("function onCopy"), button.indexOf("setCopied(true)"));
  assert.match(copyCall, /inlineCodeClipboardText\(text\)/);
  assert.doesNotMatch(copyCall, /`/);
  assert.doesNotMatch(fence, /InlineCodeCopyButton/);
  assert.doesNotMatch(fence, /md-code-inline-copy/);
  assert.match(fence, /codeBlockCopy/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(userStart, userEnd);
  assert.doesNotMatch(userBranch, /md-code-inline-copy/);
  assert.doesNotMatch(userBranch, /InlineCodeCopyButton/);
  const plainStart = app.indexOf('className="assistant-plain"');
  const plainEnd = app.indexOf("showAssistantCopy", plainStart);
  const plainBranch = app.slice(plainStart, plainEnd);
  assert.doesNotMatch(plainBranch, /md-code-inline-copy/);
  assert.doesNotMatch(shortcuts, /Copy inline code/);
  assert.doesNotMatch(iosShortcuts, /Copy inline code/);
  assert.match(body, /<AssistantInlineCodeContext.Provider value=\{completed\}>/);
});

test("iOS edit menu copies the whole span and confirms", () => {
  const menu = sliceFn(quote, "editMenuForTextIn range: NSRange", "func textView(");
  assert.match(menu, /InlineCodeCopy\.spanText\(in: attributed, selection: range\)/);
  assert.match(menu, /InlineCodeCopy\.clipboardText\(span\)/);
  assert.match(menu, /InlineCodeCopy\.noteCopied\(\)/);
  assert.match(menu, /title: InlineCodeCopy\.menuLabel/);
  assert.match(menu, /UIPasteboard\.general\.string/);
  assert.match(menu, /QuoteSelection\.label/);
  assert.match(menu, /extras \+ \[quote\] \+ suggestedActions/);
  assert.match(markdown, /snorlaxInlineCode = InlineCodeCopy\.mark/);
  assert.match(markdown, /InlineCodeCopy\.apply\(&parsed, ranges: codeSpans\)/);
  assert.match(markdown, /InlineCodeCopy\.apply\(&result, ranges: codeSpans\)/);
  assert.match(quote, /InlineCodeCopy\.ranges\(in: text\)/);
  assert.match(quote, /\.snorlaxInlineCode, value: InlineCodeCopy\.mark/);
  const confirm = sliceFn(chat, "if inlineCodeCopied {", "private func applyJumpChipPaint");
  assert.match(confirm, /Text\(InlineCodeCopy\.copiedLabel\)/);
  assert.match(confirm, /InlineCodeCopy\.copiedAria/);
  assert.match(confirm, /InlineCodeCopy\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(chat, /InlineCodeCopy\.copiedNotification/);
  assert.match(chat, /noteInlineCodeCopied\(\)/);
  assert.match(chat, /InlineCodeCopy\.feedbackNanoseconds/);
  assert.doesNotMatch(menu, /MathBlockCopy/);
  assert.doesNotMatch(swift, /UIPasteboard/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 228\. v2\.28/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_inline_code_copy\.py/);
  assert.match(pkg, /inlineCodeCopy\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
