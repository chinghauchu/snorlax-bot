// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LIST_COLLAPSE_ITEMS,
  LIST_SHOW_LESS,
  LIST_SHOW_LESS_ARIA,
  LIST_SHOW_MORE,
  LIST_SHOW_MORE_ARIA,
  listCollapseAnimates,
  listCollapseAria,
  listCollapseLabel,
  listFindKeepsOpen,
  listFindText,
  listOverflows,
  listVisibleItems,
  shouldCollapseList,
  showListCollapseToggle,
} from "./listCollapse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "listCollapse.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ListCollapse.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const footnotesSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownFootnote.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.34 collapse long lists";

function items(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `item ${index + 1}`);
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing ${selector}`);
  const start = css.indexOf("{", at);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test(
  "v2.34 collapse long lists (a completed assistant bulleted, numbered, or task list with more than 8 items shows the first 8 items and a muted 12px/12pt Show more; click or tap expands that list and the control becomes Show less; each list collapses on its own, including a nested list; the choice is not saved; 8 items or fewer stay open; a footnote list stays open; streaming stays plain text; Copy still copies the whole message, including hidden items; the accessible name is Show more list, or Show less list when open; the visible label stays Show more / Show less; an active find match in that list stays fully visible and the control hides while that match is the active one; a match in another bubble, or in prose the list does not contain, leaves this list collapsed; ordered numbers stay with their items; the control does not move composer focus; Reduce Motion adds no animation; no new shortcut; no new HTTP)",
  () => {
    assert.equal(LIST_COLLAPSE_ITEMS, 8);
    assert.equal(LIST_SHOW_MORE, "Show more");
    assert.equal(LIST_SHOW_LESS, "Show less");
    assert.equal(LIST_SHOW_MORE_ARIA, "Show more list");
    assert.equal(LIST_SHOW_LESS_ARIA, "Show less list");
    assert.equal(listOverflows(8), false);
    assert.equal(listOverflows(9), true);
    assert.equal(listOverflows(0), false);
    assert.equal(
      shouldCollapseList({
        completed: true,
        itemCount: 8,
        expanded: false,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      shouldCollapseList({
        completed: true,
        itemCount: 9,
        expanded: false,
        activeFind: false,
      }),
      true,
    );
    assert.equal(
      shouldCollapseList({
        completed: false,
        itemCount: 9,
        expanded: false,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      shouldCollapseList({
        completed: true,
        itemCount: 9,
        expanded: true,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      shouldCollapseList({
        completed: true,
        itemCount: 9,
        expanded: false,
        activeFind: true,
      }),
      false,
    );
    assert.equal(
      showListCollapseToggle({
        completed: true,
        itemCount: 9,
        activeFind: false,
      }),
      true,
    );
    assert.equal(
      showListCollapseToggle({
        completed: true,
        itemCount: 8,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      showListCollapseToggle({
        completed: false,
        itemCount: 9,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      showListCollapseToggle({
        completed: true,
        itemCount: 9,
        activeFind: true,
      }),
      false,
    );
    const nine = items(9);
    assert.deepEqual(listVisibleItems(nine, false), nine);
    assert.deepEqual(listVisibleItems(nine, true), items(8));
    assert.equal(listVisibleItems(items(8), true).length, 8);
    assert.equal(listCollapseLabel(false), "Show more");
    assert.equal(listCollapseLabel(true), "Show less");
    assert.equal(listCollapseAria(false), "Show more list");
    assert.equal(listCollapseAria(true), "Show less list");
    assert.equal(listCollapseAnimates(false), false);
    assert.equal(listCollapseAnimates(true), false);
    assert.equal(listFindText(["one", "two"]), "one\ntwo");
    assert.equal(
      listFindKeepsOpen({
        activeRowId: "m:0",
        wrapScope: "m:0",
        text: listFindText(nine),
        query: "item 9",
      }),
      true,
    );
    assert.equal(
      listFindKeepsOpen({
        activeRowId: "m:1",
        wrapScope: "m:0",
        text: listFindText(nine),
        query: "item 9",
      }),
      false,
    );
    assert.equal(
      listFindKeepsOpen({
        activeRowId: "m:0",
        wrapScope: "m:0",
        text: listFindText(nine),
        query: "only in the prose",
      }),
      false,
    );
    assert.equal(
      listFindKeepsOpen({
        activeRowId: "",
        wrapScope: "",
        text: listFindText(nine),
        query: "item 9",
      }),
      false,
    );
    assert.equal(
      listFindKeepsOpen({
        activeRowId: "m#1",
        wrapScope: "m#1",
        text: listFindText(nine),
        query: "   ",
      }),
      false,
    );
    assert.match(src, /No new HTTP/);
    assert.match(src, /No animation/);
    assert.doesNotMatch(src, /\/v1\//);
    assert.doesNotMatch(src, /fetch\(/);
    assert.doesNotMatch(src, /new Map/);
    assert.doesNotMatch(src, /localStorage/);
    assert.doesNotMatch(src, /computerPane\.ts/);
    assert.match(swift, /static let showMore = "Show more"/);
    assert.match(swift, /static let showLess = "Show less"/);
    assert.match(swift, /static let showMoreAria = "Show more list"/);
    assert.match(swift, /static let showLessAria = "Show less list"/);
    assert.match(swift, /static let itemCount = 8/);
    assert.match(swift, /static func findKeepsOpen\(/);
    assert.match(swift, /ChatFind.indexHits/);
    assert.match(swift, /return nil/);
    assert.doesNotMatch(swift, /\/v1\//);
    assert.doesNotMatch(swift, /UserDefaults/);
    assert.doesNotMatch(swift, /computerPane\.ts/);
  },
);

test("desktop and iOS collapse each finished list and still copy the whole message", () => {
  const chrome = sliceFn(body, "function CollapsibleList", "function MarkdownParsedBody");
  assert.match(chrome, /listFindKeepsOpen\(/);
  assert.match(chrome, /shouldCollapseList\(/);
  assert.match(chrome, /listVisibleItems\(items, collapsed\)/);
  assert.match(chrome, /showListCollapseToggle\(/);
  assert.match(chrome, /typeof start === "number"/);
  assert.match(chrome, /<ol start=\{start\}>/);
  assert.match(chrome, /className="md-list-more"/);
  assert.match(chrome, /aria-expanded=\{expanded\}/);
  assert.match(chrome, /aria-label=\{listCollapseAria\(expanded\)\}/);
  assert.match(chrome, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(chrome, /listCollapseLabel\(expanded\)/);
  assert.match(chrome, /setExpanded\(false\)/);
  assert.match(chrome, /wrapScope,/);
  assert.doesNotMatch(chrome, /copyText\(/);
  assert.doesNotMatch(chrome, /localStorage/);
  const tasks = sliceFn(body, 'if (block.type === "tasks")', 'return (\n          <SetextPieces');
  assert.match(tasks, /CollapsibleList/);
  assert.match(tasks, /className="md-task-list"/);
  assert.match(tasks, /data-loose=\{block\.loose \? "true" : "false"\}/);
  assert.match(tasks, /listFindText\(block\.items\.map\(\(item\) => item\.text\)\)/);
  const special = sliceFn(body, "function MarkdownListsWithTables", "function MarkdownParsed");
  assert.match(special, /CollapsibleList/);
  assert.match(special, /listFindText\(block\.list\.items\)/);
  assert.match(special, /start=\{block\.list\.start\}/);
  assert.match(body, /ol: \(\{ start, children \}\) => \(/);
  assert.match(body, /ul: \(\{ children \}\) => \(/);
  const notes = sliceFn(body, "export function FootnotesList", "function focusFootnote");
  assert.match(notes, /<ol className="md-fn-list">/);
  assert.doesNotMatch(notes, /CollapsibleList/);
  assert.match(app, /copyText\(reply\.content\)/);
  const keep = sliceFn(body, "function keepCodeBlockFocus(", "function FenceChrome(");
  assert.match(keep, /preventDefault\(\)/);
  assert.doesNotMatch(keep, /\.focus\(/);

  const button = block(".md-list-more");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /font-weight:\s*500/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /transition:\s*none/);
  assert.match(button, /animation:\s*none/);
  const reduceAt = css.indexOf(".md-list-more {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for list collapse");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 80,
  );
  assert.match(reduce, /\.md-list-more/);
  assert.match(reduce, /animation:\s*none/);

  const list = sliceFn(markdown, "struct MarkdownListBlock", "struct MarkdownListItemRow");
  assert.match(list, /ListCollapse.findKeepsOpen\(/);
  assert.match(list, /ListCollapse.shouldCollapse\(/);
  assert.match(list, /ListCollapse.visibleItems/);
  assert.match(list, /ListCollapse.showsControl\(/);
  assert.match(list, /ForEach\(Array\(shown\.enumerated\(\)\)/);
  assert.match(list, /index: index/);
  assert.match(list, /ListCollapse.label\(expanded: expanded\)/);
  assert.match(list, /ListCollapse.accessibilityLabel\(expanded: expanded\)/);
  assert.match(list, /focusable\(false\)/);
  assert.match(list, /expanded = false/);
  assert.doesNotMatch(list, /\.focus\(/);
  assert.doesNotMatch(list, /withAnimation/);
  const task = sliceFn(markdown, "struct MarkdownTaskList", "struct MarkdownTaskRow");
  assert.match(task, /ListCollapse.visibleItems/);
  assert.match(task, /ListCollapse.label\(expanded: expanded\)/);
  assert.match(task, /focusable\(false\)/);
  assert.match(task, /expanded = false/);
  assert.doesNotMatch(task, /Toggle/);
  assert.doesNotMatch(task, /withAnimation/);
  const footnotes = sliceFn(
    footnotesSwift,
    "struct MarkdownFootnoteList",
    "struct MarkdownFootnotePopover",
  );
  assert.doesNotMatch(footnotes, /ListCollapse/);
  assert.doesNotMatch(shortcuts, /Show more list/);
  assert.doesNotMatch(iosShortcuts, /Show more list/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 234\. v2\.34/);
  assert.match(ci, /test_ios_list_collapse\.py/);
  assert.match(pkg, /src\/listCollapse\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
