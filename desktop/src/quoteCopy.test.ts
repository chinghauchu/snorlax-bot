// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { LAZY_CONTINUATION_MARK } from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import {
  QUOTE_COPIED_ARIA,
  QUOTE_COPIED_LABEL,
  QUOTE_COPY_ARIA,
  QUOTE_COPY_LABEL,
  QUOTE_COPY_MS,
  quoteClipboardText,
  quoteCopyAnimates,
  quoteCopyAriaLabel,
  quoteCopyLabel,
  showQuoteCopy,
} from "./quoteCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "quoteCopy.ts"), "utf8");
const quoteTask = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteCopy.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const splitter = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.35 copy a blockquote";

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

function quoteSource(text: string): string {
  const part = splitQuoteAndTasks(text, true).find((block) => block.type === "quote");
  assert.ok(part && part.type === "quote");
  return part.type === "quote" ? part.source : "";
}

test("clipboard is the quote lines, not the stripped display text", () => {
  assert.equal(quoteClipboardText("> quoted"), "> quoted");
  assert.equal(quoteClipboardText("> quoted\n>> nested"), "> quoted\n>> nested");
  assert.equal(quoteClipboardText("   > indented"), "   > indented");
  assert.equal(quoteClipboardText(">"), ">");
  assert.equal(quoteClipboardText(""), "");
  assert.equal(QUOTE_COPY_MS, 1500);
  assert.equal(QUOTE_COPY_LABEL, "Copy");
  assert.equal(QUOTE_COPIED_LABEL, "Copied");
  assert.equal(quoteCopyLabel(false), "Copy");
  assert.equal(quoteCopyLabel(true), "Copied");
  assert.equal(QUOTE_COPY_ARIA, "Copy quote");
  assert.equal(QUOTE_COPIED_ARIA, "Copied");
  assert.equal(quoteCopyAriaLabel(false), "Copy quote");
  assert.equal(quoteCopyAriaLabel(true), "Copied");
  assert.equal(showQuoteCopy({ completed: true, source: "> quoted" }), true);
  assert.equal(showQuoteCopy({ completed: false, source: "> quoted" }), false);
  assert.equal(showQuoteCopy({ completed: true, source: "" }), false);
  assert.equal(showQuoteCopy({ completed: true, source: ">" }), true);
  assert.equal(quoteCopyAnimates(false), false);
  assert.equal(quoteCopyAnimates(true), false);
  assert.match(src, /Never animate/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /copied \? copiedAria : copyAria/);
  assert.match(swift, /static let copyAria = "Copy quote"/);
  assert.match(swift, /completed && !source.isEmpty/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});

test("the splitter keeps the original lines on the quote block", () => {
  const parts = splitQuoteAndTasks("> quoted text\n>> nested", true);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "quote");
  if (parts[0]?.type !== "quote") return;
  assert.equal(parts[0].text, "quoted text\n> nested");
  assert.equal(parts[0].source, "> quoted text\n>> nested");
  assert.equal(quoteClipboardText(parts[0].source), parts[0].source);
  assert.notEqual(quoteClipboardText(parts[0].source), parts[0].text);
  const inner = splitQuoteAndTasks(parts[0].text, true);
  const nested = inner.find((block) => block.type === "quote");
  assert.ok(nested && nested.type === "quote");
  if (nested?.type === "quote") {
    assert.equal(nested.text, "nested");
    assert.equal(nested.source, "> nested");
    assert.equal(quoteClipboardText(nested.source), "> nested");
  }

  assert.equal(quoteSource("> foo\nbar\n\nbaz"), "> foo\nbar");
  const lazy = splitQuoteAndTasks("> foo | bar\nbaz | qux", true);
  assert.equal(lazy[0]?.type, "quote");
  if (lazy[0]?.type === "quote") {
    assert.equal(lazy[0].source, "> foo | bar\nbaz | qux");
    assert.equal(quoteClipboardText(lazy[0].source), lazy[0].source);
    assert.doesNotMatch(lazy[0].source, /§§SBTL§§/);
    assert.match(lazy[0].text, new RegExp(LAZY_CONTINUATION_MARK.replaceAll("$", "\\$")));
  }

  const fenced = splitQuoteAndTasks("```\n> not a quote\n```", true);
  assert.equal(fenced.some((block) => block.type === "quote"), false);
  const streaming = splitQuoteAndTasks("> quote", false);
  assert.equal(streaming[0]?.type, "markdown");
  assert.equal(streaming.some((block) => block.type === "quote"), false);
  const tasks = splitQuoteAndTasks("- [ ] open\n- [x] done", true);
  assert.equal(tasks.some((block) => block.type === "quote"), false);
  assert.match(quoteTask, /source: lines\.slice\(start, i\)\.join\("\\n"\)/);
  assert.match(splitter, /lines\[start..<index\]\.joined\(separator: "\\n"\)/);
  assert.match(splitter, /case quote\(String, source: String\)/);
});

test("desktop Copy is on the quote and hidden until hover or focus", () => {
  const chrome = block(".md-quote-copy");
  assert.match(chrome, /position:\s*absolute/);
  assert.match(chrome, /top:\s*0/);
  assert.match(chrome, /right:\s*0/);
  assert.match(chrome, /font-size:\s*12px/);
  assert.match(chrome, /color:\s*var\(--text-muted\)/);
  assert.match(chrome, /opacity:\s*0/);
  assert.match(chrome, /pointer-events:\s*none/);
  assert.match(chrome, /user-select:\s*none/);
  assert.match(chrome, /transition:\s*none/);
  assert.match(chrome, /animation:\s*none/);
  assert.match(css, /blockquote\.md-quote:hover > \.md-quote-copy/);
  assert.match(css, /blockquote\.md-quote:focus-within > \.md-quote-copy/);
  assert.match(css, /\.md-quote-copy\.is-copied/);
  assert.match(css, /opacity:\s*1/);
  assert.match(css, /pointer-events:\s*auto/);
  const reduceAt = css.indexOf("v2.35: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for quote Copy");
  const reduce = css.slice(reduceAt, reduceAt + 280);
  assert.match(reduce, /\.md-quote-copy/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);

  const button = sliceFn(body, "function QuoteCopyButton(", "function QuoteTaskPieces(");
  const pieces = sliceFn(body, "function QuoteTaskPieces(", "function SetextPieces(");
  const quoteBranch = pieces.slice(
    pieces.indexOf('block.type === "quote"'),
    pieces.indexOf('block.type === "tasks"'),
  );
  const taskBranch = pieces.slice(pieces.indexOf('block.type === "tasks"'));
  assert.match(button, /quoteClipboardText\(source\)/);
  assert.match(button, /quoteCopyLabel\(copied\)/);
  assert.match(button, /aria-label=\{quoteCopyAriaLabel\(copied\)\}/);
  assert.match(button, /aria-live="polite"/);
  assert.match(button, /type="button"/);
  assert.match(button, /className=\{copied \? "md-quote-copy is-copied" : "md-quote-copy"\}/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /event\.preventDefault\(\)/);
  assert.match(button, /event\.stopPropagation\(\)/);
  assert.match(button, /QUOTE_COPY_MS/);
  assert.doesNotMatch(button, /block\.text/);
  assert.match(quoteBranch, /showQuoteCopy\(\{ completed, source: block\.source \}\)/);
  assert.match(quoteBranch, /<QuoteCopyButton source=\{block\.source\} \/>/);
  assert.match(quoteBranch, /text=\{block\.text\}/);
  assert.doesNotMatch(taskBranch, /QuoteCopyButton/);
  assert.doesNotMatch(taskBranch, /md-quote-copy/);
  assert.doesNotMatch(shortcuts, /Copy quote/);
  assert.doesNotMatch(iosShortcuts, /Copy quote/);
  assert.match(app, /copyText\(reply\.content\)/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(userStart, userEnd);
  assert.doesNotMatch(userBranch, /md-quote-copy/);
  assert.doesNotMatch(userBranch, /QuoteCopyButton/);
  const plainStart = app.indexOf('className="assistant-plain"');
  const plainEnd = app.indexOf("showAssistantCopy", plainStart);
  const plainBranch = app.slice(plainStart, plainEnd);
  assert.doesNotMatch(plainBranch, /md-quote-copy/);
});

test("iOS Copy sits on the quote and writes that quote's lines", () => {
  const block = sliceFn(markdown, "struct MarkdownQuoteBlock", "struct MarkdownTaskList");
  assert.match(block, /QuoteCopy\.showsCopy\(completed: completed, source: markdown\)/);
  assert.match(block, /QuoteCopy\.label\(copied: copied\)/);
  assert.match(block, /QuoteCopy\.accessibilityLabel\(copied: copied\)/);
  assert.match(block, /QuoteCopy\.clipboardText\(markdown\)/);
  assert.match(block, /UIPasteboard\.general\.string = text/);
  assert.match(block, /QuoteCopy\.feedbackNanoseconds/);
  assert.match(block, /QuoteCopy\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(block, /focusable\(false\)/);
  assert.match(block, /copied = false/);
  assert.doesNotMatch(block, /withAnimation/);
  assert.doesNotMatch(block, /\.focus\(/);
  assert.match(markdown, /case \.quote\(let text, let source\)/);
  assert.match(markdown, /markdown: source/);
  const tasks = sliceFn(markdown, "struct MarkdownTaskList", "struct MarkdownTaskRow");
  assert.doesNotMatch(tasks, /QuoteCopy/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 235\. v2\.35/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_quote_copy\.py/);
  assert.match(pkg, /quoteCopy\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
