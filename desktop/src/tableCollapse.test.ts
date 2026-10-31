// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  TABLE_COLLAPSE_ROWS,
  TABLE_SHOW_LESS,
  TABLE_SHOW_LESS_ARIA,
  TABLE_SHOW_MORE,
  TABLE_SHOW_MORE_ARIA,
  shouldCollapseTable,
  showTableCollapseToggle,
  tableCollapseAnimates,
  tableCollapseAria,
  tableCollapseLabel,
  tableFindKeepsOpen,
  tableFindText,
  tableOverflows,
  tableVisibleRows,
} from "./tableCollapse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "tableCollapse.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "TableCollapse.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.33 collapse long tables";

function rows(count: number): string[][] {
  return Array.from({ length: count }, (_, index) => [`r${index + 1}`, "x"]);
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
  "v2.33 collapse long tables (a completed assistant table with more than 8 body rows shows the header and the first 8 body rows and a muted 12px/12pt Show more; click or tap expands that table and the control becomes Show less; each table collapses on its own; the choice is not saved; 8 body rows or fewer stay open; streaming stays plain text; Copy, Cells, and Save still use the full table, including hidden rows; the accessible name is Show more table, or Show less table when open; the visible label stays Show more / Show less; an active find match in that table stays fully visible and the control hides while that match is the active one; a match in another bubble, or in prose the table does not contain, leaves this table collapsed; the control does not move composer focus; Reduce Motion adds no animation; no new shortcut; no new HTTP)",
  () => {
    assert.equal(TABLE_COLLAPSE_ROWS, 8);
    assert.equal(TABLE_SHOW_MORE, "Show more");
    assert.equal(TABLE_SHOW_LESS, "Show less");
    assert.equal(TABLE_SHOW_MORE_ARIA, "Show more table");
    assert.equal(TABLE_SHOW_LESS_ARIA, "Show less table");
    assert.equal(tableOverflows(8), false);
    assert.equal(tableOverflows(9), true);
    assert.equal(tableOverflows(0), false);
    assert.equal(
      shouldCollapseTable({
        completed: true,
        rowCount: 8,
        expanded: false,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      shouldCollapseTable({
        completed: true,
        rowCount: 9,
        expanded: false,
        activeFind: false,
      }),
      true,
    );
    assert.equal(
      shouldCollapseTable({
        completed: false,
        rowCount: 9,
        expanded: false,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      shouldCollapseTable({
        completed: true,
        rowCount: 9,
        expanded: true,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      shouldCollapseTable({
        completed: true,
        rowCount: 9,
        expanded: false,
        activeFind: true,
      }),
      false,
    );
    assert.equal(
      showTableCollapseToggle({
        completed: true,
        rowCount: 9,
        activeFind: false,
      }),
      true,
    );
    assert.equal(
      showTableCollapseToggle({
        completed: true,
        rowCount: 8,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      showTableCollapseToggle({
        completed: false,
        rowCount: 9,
        activeFind: false,
      }),
      false,
    );
    assert.equal(
      showTableCollapseToggle({
        completed: true,
        rowCount: 9,
        activeFind: true,
      }),
      false,
    );
    const nine = rows(9);
    assert.deepEqual(tableVisibleRows(nine, false), nine);
    assert.deepEqual(
      tableVisibleRows(nine, true).map((row) => row[0]),
      ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
    );
    assert.equal(tableVisibleRows(rows(8), true).length, 8);
    assert.equal(tableCollapseLabel(false), "Show more");
    assert.equal(tableCollapseLabel(true), "Show less");
    assert.equal(tableCollapseAria(false), "Show more table");
    assert.equal(tableCollapseAria(true), "Show less table");
    assert.equal(tableCollapseAnimates(false), false);
    assert.equal(tableCollapseAnimates(true), false);
    const header = ["Name", "Note"];
    assert.equal(
      tableFindKeepsOpen({
        activeRowId: "m:0",
        wrapScope: "m:0",
        header,
        rows: nine,
        query: "r9",
      }),
      true,
    );
    assert.equal(
      tableFindKeepsOpen({
        activeRowId: "m:1",
        wrapScope: "m:0",
        header,
        rows: nine,
        query: "r9",
      }),
      false,
    );
    assert.equal(
      tableFindKeepsOpen({
        activeRowId: "m:0",
        wrapScope: "m:0",
        header,
        rows: nine,
        query: "only in the prose",
      }),
      false,
    );
    assert.equal(
      tableFindKeepsOpen({
        activeRowId: "",
        wrapScope: "",
        header,
        rows: nine,
        query: "r9",
      }),
      false,
    );
    assert.equal(
      tableFindKeepsOpen({
        activeRowId: "m#1",
        wrapScope: "m#1",
        header,
        rows: nine,
        query: "   ",
      }),
      false,
    );
    assert.match(tableFindText(header, [["Ada", "kept"]]), /Ada/);
    assert.doesNotMatch(tableFindText(header, nine), /---/);
    assert.match(src, /No new HTTP/);
    assert.match(src, /No animation/);
    assert.doesNotMatch(src, /\/v1\//);
    assert.doesNotMatch(src, /fetch\(/);
    assert.doesNotMatch(src, /new Map/);
    assert.doesNotMatch(src, /localStorage/);
    assert.doesNotMatch(src, /computerPane\.ts/);
    assert.match(swift, /static let showMore = "Show more"/);
    assert.match(swift, /static let showLess = "Show less"/);
    assert.match(swift, /static let showMoreAria = "Show more table"/);
    assert.match(swift, /static let showLessAria = "Show less table"/);
    assert.match(swift, /static let bodyRows = 8/);
    assert.match(swift, /static func findKeepsOpen\(/);
    assert.match(swift, /ChatFind.indexHits/);
    assert.match(swift, /return nil/);
    assert.doesNotMatch(swift, /\/v1\//);
    assert.doesNotMatch(swift, /UserDefaults/);
    assert.doesNotMatch(swift, /computerPane\.ts/);
  },
);

test("desktop and iOS collapse each finished table and still copy and save it all", () => {
  const chrome = sliceFn(body, "function MarkdownTableBlock", "function tableAlignClass");
  assert.match(chrome, /tableFindKeepsOpen\(/);
  assert.match(chrome, /shouldCollapseTable\(/);
  assert.match(chrome, /tableVisibleRows\(table\.rows, collapsed\)/);
  assert.match(chrome, /showTableCollapseToggle\(/);
  assert.match(chrome, /shownRows\.map/);
  assert.match(chrome, /className="md-table-more"/);
  assert.match(chrome, /aria-expanded=\{expanded\}/);
  assert.match(chrome, /aria-label=\{tableCollapseAria\(expanded\)\}/);
  assert.match(chrome, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(chrome, /tableCollapseLabel\(expanded\)/);
  assert.match(chrome, /setExpanded\(false\)/);
  assert.match(chrome, /wrapScope,/);
  assert.match(body, /wrapScope=\{wrapScope\}/);
  const copyCall = sliceFn(chrome, "function onCopy", "function onCells");
  assert.match(copyCall, /tableClipboardText\(table\.source\)/);
  assert.doesNotMatch(copyCall, /shownRows/);
  const cellsCall = sliceFn(chrome, "function onCells", "function onSave");
  assert.match(cellsCall, /tableCellsClipboardText\(table\.header, table\.rows\)/);
  assert.doesNotMatch(cellsCall, /shownRows/);
  const saveCall = sliceFn(chrome, "function onSave", "const rowCount");
  assert.match(saveCall, /tableCsvText\(table\.header, table\.rows\)/);
  assert.doesNotMatch(saveCall, /shownRows/);
  const keep = sliceFn(body, "function keepCodeBlockFocus(", "function FenceChrome(");
  assert.match(keep, /preventDefault\(\)/);
  assert.doesNotMatch(keep, /\.focus\(/);

  const button = block(".md-table-more");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /font-weight:\s*500/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /transition:\s*none/);
  assert.match(button, /animation:\s*none/);
  const reduceAt = css.indexOf(".md-table-more {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for table collapse");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 80,
  );
  assert.match(reduce, /\.md-table-more/);
  assert.match(reduce, /animation:\s*none/);

  const table = sliceFn(markdown, "struct MarkdownTableBlock", "struct MermaidFence");
  assert.match(table, /TableCollapse.findKeepsOpen\(/);
  assert.match(table, /TableCollapse.shouldCollapse\(/);
  assert.match(table, /TableCollapse.visibleRows/);
  assert.match(table, /TableCollapse.showToggle\(/);
  assert.match(table, /ForEach\(Array\(shownRows.enumerated\(\)\)/);
  assert.match(table, /rows: table\.rows/);
  assert.match(table, /MarkdownTableCopy.clipboardText\(table\.source\)/);
  assert.match(table, /TableCollapse.label\(expanded: expanded\)/);
  assert.match(table, /TableCollapse.accessibilityLabel\(expanded: expanded\)/);
  assert.match(table, /focusable\(false\)/);
  assert.match(table, /expanded = false/);
  assert.doesNotMatch(
    sliceFn(table, "Button(TableCollapse.label", "private func saveTable"),
    /\.focus\(/,
  );
  assert.doesNotMatch(shortcuts, /Show more table/);
  assert.doesNotMatch(iosShortcuts, /Show more table/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 233\. v2\.33/);
  assert.match(ci, /test_ios_table_collapse\.py/);
  assert.match(pkg, /src\/tableCollapse\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
