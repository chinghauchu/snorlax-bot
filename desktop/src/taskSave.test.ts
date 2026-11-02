// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitMarkdownLists } from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { taskClipboardText } from "./taskCopy.ts";
import {
  TASK_SAVE_ARIA,
  TASK_SAVE_FILENAME,
  TASK_SAVE_LABEL,
  TASK_SAVE_MIME,
  TASK_SAVE_MS,
  TASK_SAVED_ARIA,
  TASK_SAVED_LABEL,
  taskSaveAnimates,
  taskSaveAriaLabel,
  taskSaveBody,
  taskSaveKeepsTasks,
  taskSaveLabel,
  showTaskSave,
} from "./taskSave.ts";
import {
  TASK_COPY_ARIA,
  TASK_COPY_LABEL,
  TASK_COPY_MS,
  TASK_COPIED_ARIA,
  TASK_COPIED_LABEL,
  taskCopyAriaLabel,
  taskCopyLabel,
  showTaskCopy,
} from "./taskCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "taskSave.ts"), "utf8");
const copySrc = readFileSync(join(here, "taskCopy.ts"), "utf8");
const splitter = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const listSave = readFileSync(join(here, "listSave.ts"), "utf8");
const quoteSave = readFileSync(join(here, "quoteSave.ts"), "utf8");
const mathSave = readFileSync(join(here, "mathBlockSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "TaskSave.swift"),
  "utf8",
);
const copySwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "TaskCopy.swift"),
  "utf8",
);
const quoteTaskSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"),
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

const PHRASE = "v2.39 save a task list";

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

function taskSource(text: string): string {
  const found = splitQuoteAndTasks(text, true).find((part) => part.type === "tasks");
  assert.ok(found && found.type === "tasks", `missing tasks in ${JSON.stringify(text)}`);
  if (found?.type !== "tasks") return "";
  return found.source;
}

test("labels, timing, and no animation", () => {
  assert.equal(TASK_SAVE_LABEL, "Save");
  assert.equal(TASK_SAVED_LABEL, "Saved");
  assert.equal(TASK_SAVE_ARIA, "Save task list");
  assert.equal(TASK_SAVED_ARIA, "Saved");
  assert.equal(TASK_SAVE_MS, 1500);
  assert.equal(TASK_SAVE_FILENAME, "tasks.md");
  assert.equal(TASK_SAVE_MIME, "text/markdown;charset=utf-8");
  assert.equal(TASK_COPY_LABEL, "Copy");
  assert.equal(TASK_COPIED_LABEL, "Copied");
  assert.equal(TASK_COPY_ARIA, "Copy task list");
  assert.equal(TASK_COPIED_ARIA, "Copied");
  assert.equal(TASK_COPY_MS, 1500);
  assert.equal(taskSaveLabel(false), "Save");
  assert.equal(taskSaveLabel(true), "Saved");
  assert.equal(taskSaveAriaLabel(false), "Save task list");
  assert.equal(taskSaveAriaLabel(true), "Saved");
  assert.equal(taskCopyLabel(false), "Copy");
  assert.equal(taskCopyLabel(true), "Copied");
  assert.equal(taskCopyAriaLabel(false), "Copy task list");
  assert.equal(taskCopyAriaLabel(true), "Copied");
  assert.equal(showTaskSave({ completed: true, source: "- [ ] item" }), true);
  assert.equal(showTaskSave({ completed: false, source: "- [ ] item" }), false);
  assert.equal(showTaskSave({ completed: true, source: "" }), false);
  assert.equal(showTaskCopy({ completed: true, source: "- [x] done" }), true);
  assert.equal(showTaskCopy({ completed: false, source: "- [x] done" }), false);
  assert.equal(showTaskCopy({ completed: true, source: "" }), false);
  assert.equal(taskSaveKeepsTasks(), true);
  assert.equal(taskSaveAnimates(false), false);
  assert.equal(taskSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(copySrc.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(copySwift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save task list"/);
  assert.match(swift, /static let filename = "tasks.md"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-task/);
  assert.match(swift, /completed && !source.isEmpty/);
  assert.match(copySwift, /static let copyAria = "Copy task list"/);
  assert.match(copySwift, /completed && !source.isEmpty/);
  assert.match(src, /Never animate/);
  assert.match(listSave, /LIST_SAVE_FILENAME = "list.md"/);
  assert.match(quoteSave, /QUOTE_SAVE_FILENAME = "quote.md"/);
  assert.match(mathSave, /MATH_BLOCK_SAVE_FILENAME = "math.tex"/);
  assert.doesNotMatch(listSave, /tasks\.md/);
});

test("the file is the task lines, not the stripped display text", () => {
  assert.equal(taskSaveBody("- [ ] item"), "- [ ] item");
  assert.equal(taskSaveBody("- [ ] item"), taskClipboardText("- [ ] item"));
  assert.equal(taskSaveBody("- [ ] one\n- [x] two"), "- [ ] one\n- [x] two");
  assert.equal(taskSaveBody("   - [ ] indented"), "   - [ ] indented");
  assert.equal(taskSaveBody(""), "");
  assert.equal(taskSaveBody("- [ ] item\n").endsWith("\n\n"), false);

  const pair = "- [ ] open\n- [x] done";
  assert.equal(taskSource(pair), pair);
  assert.notEqual(taskSource(pair), "open\ndone");
  assert.equal(taskSaveBody(taskSource(pair)), taskClipboardText(taskSource(pair)));
  assert.equal(taskSource("* [ ] star\n* [x] next"), "* [ ] star\n* [x] next");
  assert.equal(taskSource("+ [ ] plus\n+ [X] next"), "+ [ ] plus\n+ [X] next");
  assert.equal(taskSource("- [ ] open\n  more"), "- [ ] open\n  more");
  assert.notEqual(taskSource("- [ ] open\n  more"), "open\nmore");
  assert.equal(taskSource("   - [ ] item\n   - [x] next"), "   - [ ] item\n   - [x] next");

  assert.equal(taskSource("- [ ] a\n\n- [x] b"), "- [ ] a\n\n- [x] b");
  const ended = splitQuoteAndTasks("- [ ] foo\n\nbar", true);
  const endedTask = ended.find((part) => part.type === "tasks");
  assert.ok(endedTask && endedTask.type === "tasks");
  if (endedTask?.type === "tasks") {
    assert.equal(taskSaveBody(endedTask.source), "- [ ] foo");
    assert.doesNotMatch(taskSaveBody(endedTask.source), /\n\n/);
    assert.doesNotMatch(taskSaveBody(endedTask.source), /bar/);
    assert.equal(endedTask.source.endsWith("\n"), false);
  }

  const nested = splitQuoteAndTasks(
    "- [ ] parent\n  - [ ] child\n  - [x] also\n- [ ] sib",
    true,
  );
  assert.equal(nested[0]?.type, "tasks");
  if (nested[0]?.type === "tasks") {
    assert.equal(
      taskSaveBody(nested[0].source),
      "- [ ] parent\n  - [ ] child\n  - [x] also\n- [ ] sib",
    );
    const inner = splitQuoteAndTasks(nested[0].items[0]?.text ?? "", true);
    const child = inner.find((part) => part.type === "tasks");
    assert.ok(child && child.type === "tasks");
    if (child?.type === "tasks") {
      assert.equal(child.source, "- [ ] child\n- [x] also");
      assert.equal(taskSaveBody(child.source), "- [ ] child\n- [x] also");
      assert.notEqual(taskSaveBody(child.source), "child\nalso");
    }
  }

  const long = Array.from({ length: 9 }, (_, index) => `- [ ] item ${index + 1}`).join("\n");
  const longTask = splitQuoteAndTasks(long, true).find((part) => part.type === "tasks");
  assert.ok(longTask && longTask.type === "tasks");
  if (longTask?.type === "tasks") {
    assert.equal(longTask.items.length, 9);
    assert.equal(taskSaveBody(longTask.source), long);
    assert.match(taskSaveBody(longTask.source), /item 9/);
  }

  const quoted = splitQuoteAndTasks("> - [ ] a\n> - [x] b", true);
  assert.equal(quoted[0]?.type, "quote");
  if (quoted[0]?.type === "quote") {
    const inside = splitQuoteAndTasks(quoted[0].text, true);
    const innerTask = inside.find((part) => part.type === "tasks");
    assert.ok(innerTask && innerTask.type === "tasks");
    if (innerTask?.type === "tasks") {
      assert.equal(taskSaveBody(innerTask.source), "- [ ] a\n- [x] b");
    }
  }

  const fenced = splitQuoteAndTasks("```\n- [ ] not a task\n```", true);
  assert.equal(fenced.some((part) => part.type === "tasks"), false);
  const math = splitQuoteAndTasks("$$\n- [x] not a task\n$$", true);
  assert.equal(math.some((part) => part.type === "tasks"), false);
  const streaming = splitQuoteAndTasks("- [ ] one\n- [x] two", false);
  assert.equal(streaming.some((part) => part.type === "tasks"), false);
  const bullets = splitQuoteAndTasks("- one\n- two", true);
  assert.equal(bullets.some((part) => part.type === "tasks"), false);
  const ordered = splitQuoteAndTasks("1. [ ] a\n2. [x] b", true);
  assert.equal(ordered.some((part) => part.type === "tasks"), false);
  const orderedList = splitMarkdownLists("1. [ ] a\n2. [x] b", true).find(
    (part) => part.type === "list",
  );
  assert.ok(orderedList && orderedList.type === "list");
  if (orderedList?.type === "list") {
    assert.equal(orderedList.list.source, "1. [ ] a\n2. [x] b");
  }
  assert.match(splitter, /source: taskSource/);
  assert.match(quoteTaskSwift, /source: slice/);
  assert.match(quoteTaskSwift, /case tasks\(\[TaskItem\], loose: Bool, source: String\)/);
});

test("Save sits beside Copy and does not replace it", () => {
  const button = sliceFn(body, "function TaskActions(", "function CollapsibleList(");
  assert.match(button, /showTaskSave\(\{ completed: true, source: markdown \}\)/);
  assert.match(button, /showTaskCopy\(\{ completed: true, source: markdown \}\)/);
  assert.match(button, /taskSaveBody\(markdown\)/);
  assert.match(button, /downloadTaskMarkdown\(/);
  assert.match(button, /TASK_SAVE_FILENAME/);
  assert.match(button, /taskSaveLabel\(saved\)/);
  assert.match(button, /aria-label=\{taskSaveAriaLabel\(saved\)\}/);
  assert.match(button, /className=\{saved \? "md-task-save is-saved" : "md-task-save"\}/);
  assert.match(button, /className=\{copied \? "md-task-copy is-copied" : "md-task-copy"\}/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /taskSaveKeepsTasks\(\)/);
  assert.match(button, /TASK_SAVE_MS/);
  assert.match(button, /TASK_COPY_MS/);
  assert.match(button, /className="md-task-actions"/);
  const copyAt = button.indexOf("taskCopyLabel");
  const saveAt = button.indexOf("taskSaveLabel");
  assert.ok(copyAt >= 0 && copyAt < saveAt);
  const copyCall = sliceFn(button, "function onCopy", "function onSave");
  assert.match(copyCall, /taskClipboardText\(markdown\)/);
  assert.doesNotMatch(copyCall, /taskSaveBody/);
  assert.doesNotMatch(copyCall, /downloadTaskMarkdown/);
  const saveCall = sliceFn(button, "function onSave", "return (");
  assert.match(saveCall, /taskSaveBody\(markdown\)/);
  assert.match(saveCall, /TASK_SAVE_FILENAME/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /taskClipboardText/);
  const save = block(".md-task-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-task-save:focus-visible"), /outline:/);
  assert.match(css, /\.md-task-frame:hover > \.md-task-actions/);
  assert.match(css, /\.md-task-frame:focus-within > \.md-task-actions/);
  assert.match(css, /\.md-task-actions:has\(\.is-saved\)/);
  assert.match(css, /\.md-task-actions:has\(\.is-copied\)/);
  const reduceAt = css.indexOf("v2.39: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for task Save");
  const reduce = css.slice(reduceAt, reduceAt + 320);
  assert.match(reduce, /\.md-task-save/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  const tasks = sliceFn(body, 'if (block.type === "tasks")', "return (\n          <SetextPieces");
  assert.match(tasks, /TaskActions/);
  assert.match(tasks, /className="md-task-frame"/);
  assert.match(tasks, /CollapsibleList/);
  assert.doesNotMatch(tasks, /md-list-save/);
  assert.doesNotMatch(tasks, /showListSave/);
  const lists = sliceFn(body, "function MarkdownListsWithTables", "function listItemNodes");
  assert.match(lists, /source=\{block\.list\.source\}/);
  assert.doesNotMatch(lists, /TaskActions/);
  assert.doesNotMatch(lists, /showTaskSave/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /taskSave/);
  assert.doesNotMatch(user, /md-task-save/);
  const plain = sliceFn(app, 'className="assistant-plain"', "showAssistantCopy");
  assert.doesNotMatch(plain, /md-task-save/);
  assert.doesNotMatch(shortcuts, /Save task list/);
  assert.doesNotMatch(iosShortcuts, /Save task list/);
  assert.doesNotMatch(shortcuts, /Copy task list/);
  const notes = sliceFn(body, "export function FootnotesList", "function focusFootnote");
  assert.doesNotMatch(notes, /taskSave/);
  assert.doesNotMatch(notes, /md-task-save/);
});

test("iOS Save writes the task lines and Copy stays", () => {
  const task = sliceFn(markdown, "struct MarkdownTaskList", "struct MarkdownTaskRow");
  assert.match(task, /TaskSave\.showsSave\(completed: completed, source: markdown\)/);
  assert.match(task, /TaskSave\.bodyText\(markdown\)/);
  assert.match(task, /TaskSave\.label\(saved: saved\)/);
  assert.match(task, /TaskSave\.accessibilityLabel\(saved: saved\)/);
  assert.match(task, /TaskSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(task, /TaskSave\.feedbackNanoseconds/);
  assert.match(task, /TaskSave\.filename/);
  assert.match(task, /TaskSave\.writeFile/);
  assert.match(task, /TaskSave\.keepsTasks\(\)/);
  assert.match(task, /focusable\(false\)/);
  assert.match(task, /UIActivityViewController/);
  assert.match(task, /TaskCopy\.clipboardText\(markdown\)/);
  assert.match(task, /saved = false/);
  assert.match(task, /ListCollapse\.visibleItems/);
  assert.doesNotMatch(task, /PHPhotoLibrary/);
  assert.doesNotMatch(task, /withAnimation/);
  assert.doesNotMatch(task, /ListSave/);
  assert.doesNotMatch(task, /ListCopy/);
  assert.doesNotMatch(task, /QuoteSave/);
  assert.doesNotMatch(task, /QuoteCopy/);
  const saveCall = sliceFn(task, "private func saveTasks", "private struct TaskMarkdownShareSheet");
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  const listed = sliceFn(markdown, "struct MarkdownListBlock", "struct MarkdownListItemRow");
  assert.match(listed, /ListSave\.showsSave/);
  assert.doesNotMatch(listed, /TaskSave/);
  assert.doesNotMatch(listed, /TaskCopy/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /TaskSave/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 239\. v2\.39/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_task_save\.py/);
  assert.match(pkg, /taskSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
