// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { LAZY_CONTINUATION_MARK } from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { quoteClipboardText } from "./quoteCopy.ts";
import {
  QUOTE_SAVE_ARIA,
  QUOTE_SAVE_FILENAME,
  QUOTE_SAVE_LABEL,
  QUOTE_SAVE_MIME,
  QUOTE_SAVE_MS,
  QUOTE_SAVED_ARIA,
  QUOTE_SAVED_LABEL,
  quoteSaveAnimates,
  quoteSaveAriaLabel,
  quoteSaveBody,
  quoteSaveKeepsQuote,
  quoteSaveLabel,
  showQuoteSave,
} from "./quoteSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "quoteSave.ts"), "utf8");
const tableSave = readFileSync(join(here, "tableCsvSave.ts"), "utf8");
const replySave = readFileSync(join(here, "replyMarkdownSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSave.swift"),
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

const PHRASE = "v2.36 save a blockquote";

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

test("labels, timing, and no animation", () => {
  assert.equal(QUOTE_SAVE_LABEL, "Save");
  assert.equal(QUOTE_SAVED_LABEL, "Saved");
  assert.equal(QUOTE_SAVE_ARIA, "Save quote");
  assert.equal(QUOTE_SAVED_ARIA, "Saved");
  assert.equal(QUOTE_SAVE_MS, 1500);
  assert.equal(QUOTE_SAVE_FILENAME, "quote.md");
  assert.equal(QUOTE_SAVE_MIME, "text/markdown;charset=utf-8");
  assert.equal(quoteSaveLabel(false), "Save");
  assert.equal(quoteSaveLabel(true), "Saved");
  assert.equal(quoteSaveAriaLabel(false), "Save quote");
  assert.equal(quoteSaveAriaLabel(true), "Saved");
  assert.equal(showQuoteSave({ completed: true, source: "> quoted" }), true);
  assert.equal(showQuoteSave({ completed: false, source: "> quoted" }), false);
  assert.equal(showQuoteSave({ completed: true, source: "" }), false);
  assert.equal(showQuoteSave({ completed: true, source: ">" }), true);
  assert.equal(quoteSaveKeepsQuote(), true);
  assert.equal(quoteSaveAnimates(false), false);
  assert.equal(quoteSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save quote"/);
  assert.match(swift, /static let filename = "quote.md"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-quote/);
  assert.match(swift, /completed && !source.isEmpty/);
  assert.match(src, /Never animate/);
  assert.match(tableSave, /TABLE_CSV_FILENAME = "table.csv"/);
  assert.match(replySave, /REPLY_MARKDOWN_FILENAME = "reply.md"/);
});

test("the file is the quote lines, not the stripped display text", () => {
  assert.equal(quoteSaveBody("> quoted"), "> quoted");
  assert.equal(quoteSaveBody("> quoted"), quoteClipboardText("> quoted"));
  assert.equal(quoteSaveBody("> quoted\n>> nested"), "> quoted\n>> nested");
  assert.equal(quoteSaveBody("   > indented"), "   > indented");
  assert.equal(quoteSaveBody(">"), ">");
  assert.equal(quoteSaveBody(""), "");
  assert.equal(quoteSaveBody("> quoted\n").endsWith("\n\n"), false);

  const parts = splitQuoteAndTasks("> quoted text\n>> nested", true);
  assert.equal(parts[0]?.type, "quote");
  if (parts[0]?.type !== "quote") return;
  assert.equal(quoteSaveBody(parts[0].source), parts[0].source);
  assert.equal(quoteSaveBody(parts[0].source), quoteClipboardText(parts[0].source));
  assert.notEqual(quoteSaveBody(parts[0].source), parts[0].text);
  const inner = splitQuoteAndTasks(parts[0].text, true);
  const nested = inner.find((block) => block.type === "quote");
  assert.ok(nested && nested.type === "quote");
  if (nested?.type === "quote") {
    assert.equal(nested.source, "> nested");
    assert.equal(quoteSaveBody(nested.source), "> nested");
    assert.notEqual(quoteSaveBody(nested.source), nested.text);
  }

  const lazy = splitQuoteAndTasks("> foo | bar\nbaz | qux", true);
  assert.equal(lazy[0]?.type, "quote");
  if (lazy[0]?.type === "quote") {
    assert.equal(quoteSaveBody(lazy[0].source), "> foo | bar\nbaz | qux");
    assert.equal(quoteSaveBody(lazy[0].source), quoteClipboardText(lazy[0].source));
    assert.doesNotMatch(lazy[0].source, /§§SBTL§§/);
    assert.match(lazy[0].text, new RegExp(LAZY_CONTINUATION_MARK.replaceAll("$", "\\$")));
  }

  const ended = splitQuoteAndTasks("> foo\nbar\n\nbaz", true);
  const endedQuote = ended.find((block) => block.type === "quote");
  assert.ok(endedQuote && endedQuote.type === "quote");
  if (endedQuote?.type === "quote") {
    assert.equal(quoteSaveBody(endedQuote.source), "> foo\nbar");
    assert.doesNotMatch(quoteSaveBody(endedQuote.source), /\n\n/);
  }

  const fenced = splitQuoteAndTasks("```\n> not a quote\n```", true);
  assert.equal(fenced.some((block) => block.type === "quote"), false);
  const streaming = splitQuoteAndTasks("> quote", false);
  assert.equal(streaming.some((block) => block.type === "quote"), false);
  const tasks = splitQuoteAndTasks("- [ ] open\n- [x] done", true);
  assert.equal(tasks.some((block) => block.type === "quote"), false);
});

test("Save sits beside Copy and does not replace it", () => {
  const button = sliceFn(body, "function QuoteCopyButton(", "function QuoteTaskPieces(");
  assert.match(button, /showQuoteSave\(\{ completed: true, source \}\)/);
  assert.match(button, /quoteSaveBody\(source\)/);
  assert.match(button, /downloadQuoteMarkdown\(/);
  assert.match(button, /QUOTE_SAVE_FILENAME/);
  assert.match(button, /quoteSaveLabel\(saved\)/);
  assert.match(button, /aria-label=\{quoteSaveAriaLabel\(saved\)\}/);
  assert.match(button, /className=\{saved \? "md-quote-save is-saved" : "md-quote-save"\}/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /quoteSaveKeepsQuote\(\)/);
  assert.match(button, /QUOTE_SAVE_MS/);
  assert.match(button, /className="md-quote-actions"/);
  const copyAt = button.indexOf("quoteCopyLabel");
  const saveAt = button.indexOf("quoteSaveLabel");
  assert.ok(copyAt >= 0 && copyAt < saveAt);
  const copyCall = sliceFn(button, "function onCopy", "function onSave");
  assert.match(copyCall, /quoteClipboardText\(source\)/);
  assert.doesNotMatch(copyCall, /quoteSaveBody/);
  assert.doesNotMatch(copyCall, /downloadQuoteMarkdown/);
  const saveCall = sliceFn(button, "function onSave", "return (");
  assert.match(saveCall, /quoteSaveBody\(source\)/);
  assert.match(saveCall, /QUOTE_SAVE_FILENAME/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /quoteClipboardText/);
  const save = block(".md-quote-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-quote-save:focus-visible"), /outline:/);
  assert.match(css, /blockquote\.md-quote:hover > \.md-quote-actions/);
  assert.match(css, /blockquote\.md-quote:focus-within > \.md-quote-actions/);
  assert.match(css, /\.md-quote-actions:has\(\.is-saved\)/);
  assert.match(css, /\.md-quote-actions:has\(\.is-copied\)/);
  const reduceAt = css.indexOf("v2.36: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for quote Save");
  const reduce = css.slice(reduceAt, reduceAt + 280);
  assert.match(reduce, /\.md-quote-save/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  const pieces = sliceFn(body, "function QuoteTaskPieces(", "function SetextPieces(");
  const taskBranch = pieces.slice(pieces.indexOf('block.type === "tasks"'));
  assert.doesNotMatch(taskBranch, /md-quote-save/);
  assert.doesNotMatch(taskBranch, /showQuoteSave/);
  assert.doesNotMatch(taskBranch, /QuoteSave/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /quoteSave/);
  assert.doesNotMatch(user, /md-quote-save/);
  const plain = sliceFn(app, 'className="assistant-plain"', "showAssistantCopy");
  assert.doesNotMatch(plain, /md-quote-save/);
  assert.doesNotMatch(shortcuts, /Save quote/);
  assert.doesNotMatch(iosShortcuts, /Save quote/);
});

test("iOS Save writes the quote lines and Copy stays", () => {
  const quote = sliceFn(markdown, "struct MarkdownQuoteBlock", "struct MarkdownTaskList");
  assert.match(quote, /QuoteSave\.showsSave\(completed: completed, source: markdown\)/);
  assert.match(quote, /QuoteSave\.bodyText\(markdown\)/);
  assert.match(quote, /QuoteSave\.label\(saved: saved\)/);
  assert.match(quote, /QuoteSave\.accessibilityLabel\(saved: saved\)/);
  assert.match(quote, /QuoteSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(quote, /QuoteSave\.feedbackNanoseconds/);
  assert.match(quote, /QuoteSave\.filename/);
  assert.match(quote, /QuoteSave\.writeFile/);
  assert.match(quote, /QuoteSave\.keepsQuote\(\)/);
  assert.match(quote, /focusable\(false\)/);
  assert.match(quote, /UIActivityViewController/);
  assert.match(quote, /QuoteCopy\.clipboardText\(markdown\)/);
  assert.match(quote, /saved = false/);
  assert.doesNotMatch(quote, /PHPhotoLibrary/);
  assert.doesNotMatch(quote, /withAnimation/);
  const saveCall = sliceFn(quote, "private func saveQuote", "private struct QuoteMarkdownShareSheet");
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  const tasks = sliceFn(markdown, "struct MarkdownTaskList", "struct MarkdownTaskRow");
  assert.doesNotMatch(tasks, /QuoteSave/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /QuoteSave/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 236\. v2\.36/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_quote_save\.py/);
  assert.match(pkg, /quoteSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
