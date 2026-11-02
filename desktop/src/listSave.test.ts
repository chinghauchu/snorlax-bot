// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitMarkdownLists } from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { listClipboardText } from "./listCopy.ts";
import {
  LIST_SAVE_ARIA,
  LIST_SAVE_FILENAME,
  LIST_SAVE_LABEL,
  LIST_SAVE_MIME,
  LIST_SAVE_MS,
  LIST_SAVED_ARIA,
  LIST_SAVED_LABEL,
  listSaveAnimates,
  listSaveAriaLabel,
  listSaveBody,
  listSaveKeepsList,
  listSaveLabel,
  showListSave,
} from "./listSave.ts";
import {
  LIST_COPY_ARIA,
  LIST_COPY_LABEL,
  LIST_COPY_MS,
  LIST_COPIED_ARIA,
  LIST_COPIED_LABEL,
  listCopyAriaLabel,
  listCopyLabel,
  showListCopy,
} from "./listCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "listSave.ts"), "utf8");
const copySrc = readFileSync(join(here, "listCopy.ts"), "utf8");
const quoteSave = readFileSync(join(here, "quoteSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ListSave.swift"),
  "utf8",
);
const copySwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ListCopy.swift"),
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

const PHRASE = "v2.37 save a list";

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

function listSource(text: string): string {
  const found = splitMarkdownLists(text, true).find((part) => part.type === "list");
  assert.ok(found && found.type === "list");
  if (found?.type !== "list") return "";
  return found.list.source;
}

test("labels, timing, and no animation", () => {
  assert.equal(LIST_SAVE_LABEL, "Save");
  assert.equal(LIST_SAVED_LABEL, "Saved");
  assert.equal(LIST_SAVE_ARIA, "Save list");
  assert.equal(LIST_SAVED_ARIA, "Saved");
  assert.equal(LIST_SAVE_MS, 1500);
  assert.equal(LIST_SAVE_FILENAME, "list.md");
  assert.equal(LIST_SAVE_MIME, "text/markdown;charset=utf-8");
  assert.equal(LIST_COPY_LABEL, "Copy");
  assert.equal(LIST_COPIED_LABEL, "Copied");
  assert.equal(LIST_COPY_ARIA, "Copy list");
  assert.equal(LIST_COPIED_ARIA, "Copied");
  assert.equal(LIST_COPY_MS, 1500);
  assert.equal(listSaveLabel(false), "Save");
  assert.equal(listSaveLabel(true), "Saved");
  assert.equal(listSaveAriaLabel(false), "Save list");
  assert.equal(listSaveAriaLabel(true), "Saved");
  assert.equal(listCopyLabel(false), "Copy");
  assert.equal(listCopyLabel(true), "Copied");
  assert.equal(listCopyAriaLabel(false), "Copy list");
  assert.equal(listCopyAriaLabel(true), "Copied");
  assert.equal(showListSave({ completed: true, source: "- item" }), true);
  assert.equal(showListSave({ completed: false, source: "- item" }), false);
  assert.equal(showListSave({ completed: true, source: "" }), false);
  assert.equal(showListCopy({ completed: true, source: "1. one" }), true);
  assert.equal(showListCopy({ completed: false, source: "1. one" }), false);
  assert.equal(showListCopy({ completed: true, source: "" }), false);
  assert.equal(listSaveKeepsList(), true);
  assert.equal(listSaveAnimates(false), false);
  assert.equal(listSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(copySrc.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(copySwift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save list"/);
  assert.match(swift, /static let filename = "list.md"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-list/);
  assert.match(swift, /completed && !source.isEmpty/);
  assert.match(copySwift, /static let copyAria = "Copy list"/);
  assert.match(copySwift, /completed && !source.isEmpty/);
  assert.match(src, /Never animate/);
  assert.match(quoteSave, /QUOTE_SAVE_FILENAME = "quote.md"/);
  assert.match(tableSave, /TABLE_CSV_FILENAME = "table.csv"/);
  assert.match(replySave, /REPLY_MARKDOWN_FILENAME = "reply.md"/);
});

test("the file is the list lines, not the stripped display text", () => {
  assert.equal(listSaveBody("- item"), "- item");
  assert.equal(listSaveBody("- item"), listClipboardText("- item"));
  assert.equal(listSaveBody("- one\n- two"), "- one\n- two");
  assert.equal(listSaveBody("   - indented"), "   - indented");
  assert.equal(listSaveBody(""), "");
  assert.equal(listSaveBody("- item\n").endsWith("\n\n"), false);

  assert.equal(listSource("- one\n- two"), "- one\n- two");
  assert.notEqual(listSource("- one\n- two"), "one\ntwo");
  assert.equal(listSaveBody(listSource("- one\n- two")), listClipboardText(listSource("- one\n- two")));
  assert.equal(listSource("* star\n* next"), "* star\n* next");
  assert.equal(listSource("+ plus\n+ next"), "+ plus\n+ next");
  assert.equal(listSource("3. three\n4. four"), "3. three\n4. four");
  assert.equal(listSource("9) nine\n10) ten"), "9) nine\n10) ten");
  assert.equal(listSource("   - item\n   - next"), "   - item\n   - next");

  const nested = splitMarkdownLists("- parent\n  - child", true);
  assert.equal(nested[0]?.type, "list");
  if (nested[0]?.type === "list") {
    assert.equal(listSaveBody(nested[0].list.source), "- parent\n  - child");
    const inner = splitMarkdownLists(nested[0].list.items[0] ?? "", true);
    const child = inner.find((part) => part.type === "list");
    assert.ok(child && child.type === "list");
    if (child?.type === "list") {
      assert.equal(child.list.source, "- child");
      assert.equal(listSaveBody(child.list.source), "- child");
      assert.notEqual(listSaveBody(child.list.source), "child");
    }
  }

  assert.equal(listSource("- a\n\n- b"), "- a\n\n- b");
  const ended = splitMarkdownLists("- foo\n\nbar", true);
  const endedList = ended.find((part) => part.type === "list");
  assert.ok(endedList && endedList.type === "list");
  if (endedList?.type === "list") {
    assert.equal(listSaveBody(endedList.list.source), "- foo");
    assert.doesNotMatch(listSaveBody(endedList.list.source), /\n\n/);
    assert.doesNotMatch(listSaveBody(endedList.list.source), /bar/);
  }

  const long = Array.from({ length: 9 }, (_, index) => `- item ${index + 1}`).join("\n");
  const longList = splitMarkdownLists(long, true).find((part) => part.type === "list");
  assert.ok(longList && longList.type === "list");
  if (longList?.type === "list") {
    assert.equal(longList.list.items.length, 9);
    assert.equal(listSaveBody(longList.list.source), long);
    assert.match(listSaveBody(longList.list.source), /item 9/);
  }

  const fenced = splitMarkdownLists("```\n- not a list\n```", true);
  assert.equal(fenced.some((part) => part.type === "list"), false);
  const streaming = splitMarkdownLists("- one\n- two", false);
  assert.equal(streaming.some((part) => part.type === "list"), false);
  const tasks = splitQuoteAndTasks("- [ ] open\n- [x] done", true);
  assert.equal(tasks.some((part) => part.type === "list"), false);
  assert.equal(tasks.some((part) => part.type === "tasks"), true);
});

test("Save sits beside Copy and does not replace it", () => {
  const button = sliceFn(body, "function ListActions(", "function CollapsibleList(");
  assert.match(button, /showListSave\(\{ completed: true, source \}\)/);
  assert.match(button, /showListCopy\(\{ completed: true, source \}\)/);
  assert.match(button, /listSaveBody\(source\)/);
  assert.match(button, /downloadListMarkdown\(/);
  assert.match(button, /LIST_SAVE_FILENAME/);
  assert.match(button, /listSaveLabel\(saved\)/);
  assert.match(button, /aria-label=\{listSaveAriaLabel\(saved\)\}/);
  assert.match(button, /className=\{saved \? "md-list-save is-saved" : "md-list-save"\}/);
  assert.match(button, /className=\{copied \? "md-list-copy is-copied" : "md-list-copy"\}/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /listSaveKeepsList\(\)/);
  assert.match(button, /LIST_SAVE_MS/);
  assert.match(button, /LIST_COPY_MS/);
  assert.match(button, /className="md-list-actions"/);
  const copyAt = button.indexOf("listCopyLabel");
  const saveAt = button.indexOf("listSaveLabel");
  assert.ok(copyAt >= 0 && copyAt < saveAt);
  const copyCall = sliceFn(button, "function onCopy", "function onSave");
  assert.match(copyCall, /listClipboardText\(source\)/);
  assert.doesNotMatch(copyCall, /listSaveBody/);
  assert.doesNotMatch(copyCall, /downloadListMarkdown/);
  const saveCall = sliceFn(button, "function onSave", "return (");
  assert.match(saveCall, /listSaveBody\(source\)/);
  assert.match(saveCall, /LIST_SAVE_FILENAME/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /listClipboardText/);
  const save = block(".md-list-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-list-save:focus-visible"), /outline:/);
  assert.match(css, /\.md-list-frame:hover > \.md-list-actions/);
  assert.match(css, /\.md-list-frame:focus-within > \.md-list-actions/);
  assert.match(css, /\.md-list-actions:has\(\.is-saved\)/);
  assert.match(css, /\.md-list-actions:has\(\.is-copied\)/);
  const reduceAt = css.indexOf("v2.37: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for list Save");
  const reduce = css.slice(reduceAt, reduceAt + 280);
  assert.match(reduce, /\.md-list-save/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  const tasks = sliceFn(body, 'if (block.type === "tasks")', "return (\n          <SetextPieces");
  assert.doesNotMatch(tasks, /md-list-save/);
  assert.doesNotMatch(tasks, /showListSave/);
  assert.doesNotMatch(tasks, /ListSave/);
  assert.doesNotMatch(tasks, /source=\{/);
  const lists = sliceFn(body, "function MarkdownListsWithTables", "function listItemNodes");
  assert.match(lists, /source=\{block\.list\.source\}/);
  const parsed = sliceFn(body, "function MarkdownParsed(", "function textHasTableInList");
  assert.match(parsed, /textHasMarkdownList\(sourceText\)/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /listSave/);
  assert.doesNotMatch(user, /md-list-save/);
  const plain = sliceFn(app, 'className="assistant-plain"', "showAssistantCopy");
  assert.doesNotMatch(plain, /md-list-save/);
  assert.doesNotMatch(shortcuts, /Save list/);
  assert.doesNotMatch(iosShortcuts, /Save list/);
  const notes = sliceFn(body, "export function FootnotesList", "function focusFootnote");
  assert.doesNotMatch(notes, /listSave/);
  assert.doesNotMatch(notes, /md-list-save/);
});

test("iOS Save writes the list lines and Copy stays", () => {
  const list = sliceFn(markdown, "struct MarkdownListBlock", "struct MarkdownListItemRow");
  assert.match(list, /ListSave\.showsSave\(completed: completed, source: group\.source\)/);
  assert.match(list, /ListSave\.bodyText\(group\.source\)/);
  assert.match(list, /ListSave\.label\(saved: saved\)/);
  assert.match(list, /ListSave\.accessibilityLabel\(saved: saved\)/);
  assert.match(list, /ListSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(list, /ListSave\.feedbackNanoseconds/);
  assert.match(list, /ListSave\.filename/);
  assert.match(list, /ListSave\.writeFile/);
  assert.match(list, /ListSave\.keepsList\(\)/);
  assert.match(list, /focusable\(false\)/);
  assert.match(list, /UIActivityViewController/);
  assert.match(list, /ListCopy\.clipboardText\(group\.source\)/);
  assert.match(list, /saved = false/);
  assert.doesNotMatch(list, /PHPhotoLibrary/);
  assert.doesNotMatch(list, /withAnimation/);
  const saveCall = sliceFn(list, "private func saveList", "private struct ListMarkdownShareSheet");
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  const tasks = sliceFn(markdown, "struct MarkdownTaskList", "struct MarkdownTaskRow");
  assert.doesNotMatch(tasks, /ListSave/);
  assert.doesNotMatch(tasks, /ListCopy/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /ListSave/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 237\. v2\.37/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_list_save\.py/);
  assert.match(pkg, /listSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
