// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitMarkdownTables, tableClipboardText } from "./markdownTable.ts";
import {
  TABLE_CELLS_ARIA,
  TABLE_CELLS_COPIED_ARIA,
  TABLE_CELLS_COPIED_LABEL,
  TABLE_CELLS_COPY_MS,
  TABLE_CELLS_LABEL,
  showTableCells,
  tableCellsAriaLabel,
  tableCellsClipboardText,
  tableCellsCopyAnimates,
  tableCellsLabel,
} from "./tableCellsCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "tableCellsCopy.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "TableCellsCopy.swift"),
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
const tableCopy = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownTable.swift"),
  "utf8",
);

const PHRASE = "v2.24 copy a table as cells";

const SAMPLE = "| City | Temp |\n| --- | ---: |\n| Oslo | 12 |\n| Lima | 21 |";

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
  assert.equal(TABLE_CELLS_LABEL, "Cells");
  assert.equal(TABLE_CELLS_COPIED_LABEL, "Copied");
  assert.equal(TABLE_CELLS_ARIA, "Copy cells");
  assert.equal(TABLE_CELLS_COPIED_ARIA, "Copied");
  assert.equal(TABLE_CELLS_COPY_MS, 1500);
  assert.equal(tableCellsLabel(false), "Cells");
  assert.equal(tableCellsLabel(true), "Copied");
  assert.equal(tableCellsAriaLabel(false), "Copy cells");
  assert.equal(tableCellsAriaLabel(true), "Copied");
  assert.equal(showTableCells(false), false);
  assert.equal(showTableCells(true), true);
  assert.equal(tableCellsCopyAnimates(false), false);
  assert.equal(tableCellsCopyAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.match(swift, /static let cellsLabel = "Cells"/);
  assert.match(swift, /static let copyAria = "Copy cells"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
});

test("clipboard is the painted grid, not the markdown source", () => {
  const parts = splitMarkdownTables(SAMPLE, true);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") return;
  const grid = tableCellsClipboardText(parts[0].table.header, parts[0].table.rows);
  assert.equal(grid, "City\tTemp\nOslo\t12\nLima\t21");
  assert.equal(grid.includes("---"), false);
  assert.equal(grid.includes("|"), false);
  assert.equal(tableClipboardText(parts[0].table.source), SAMPLE);
  assert.notEqual(grid, tableClipboardText(parts[0].table.source));
});

test("quotes, tabs, pipes, padding, and dropped cells", () => {
  assert.equal(
    tableCellsClipboardText(["Say", "N"], [['He said "hi"', "1"]]),
    'Say\tN\n"He said ""hi"""\t1',
  );
  assert.equal(tableCellsClipboardText(["A"], [["a\tb"]]), 'A\n"a\tb"');
  assert.equal(tableCellsClipboardText(["A"], [["a\nb"]]), 'A\n"a\nb"');
  assert.equal(tableCellsClipboardText(["A", "B"], [["only"]]), "A\tB\nonly\t");
  assert.equal(
    tableCellsClipboardText(["A"], [["1", "extra"]]),
    "A\n1",
  );
  assert.equal(tableCellsClipboardText(["**bold**"], [["x \\| y"]]), "**bold**\nx | y");
  assert.equal(tableCellsClipboardText([], [["z"]]), "");
  const piped = splitMarkdownTables(
    "| a \\| b | c |\n| --- | --- |\n| 1 | 2 |",
    true,
  );
  assert.equal(piped[0]?.type, "table");
  if (piped[0]?.type !== "table") return;
  assert.equal(
    tableCellsClipboardText(piped[0].table.header, piped[0].table.rows),
    "a | b\tc\n1\t2",
  );
});

test("Cells sits beside Copy and does not replace markdown Copy", () => {
  const blockSrc = sliceFn(body, "function MarkdownTableBlock", "function tableAlignClass");
  assert.match(blockSrc, /showTableCells\(completed\)/);
  assert.match(blockSrc, /tableCellsClipboardText\(table\.header, table\.rows\)/);
  assert.match(blockSrc, /tableCellsLabel\(cellsCopied\)/);
  assert.match(blockSrc, /aria-label=\{tableCellsAriaLabel\(cellsCopied\)\}/);
  assert.match(blockSrc, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(blockSrc, /className="md-table-actions"/);
  const copyCall = sliceFn(blockSrc, "function onCopy", "function onCells");
  assert.match(copyCall, /tableClipboardText\(table\.source\)/);
  assert.doesNotMatch(copyCall, /tableCellsClipboardText/);
  const cellsCall = sliceFn(blockSrc, "function onCells", "return (");
  assert.match(cellsCall, /tableCellsClipboardText\(table\.header, table\.rows\)/);
  assert.doesNotMatch(cellsCall, /tableClipboardText/);
  const actions = block(".md-table-actions");
  assert.match(actions, /gap:\s*12px/);
  assert.match(actions, /margin-left:\s*auto/);
  const reduce = css.slice(css.indexOf("prefers-reduced-motion: reduce"));
  assert.match(reduce, /\.md-table-actions/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  assert.doesNotMatch(shortcuts, /Copy cells/);
  assert.doesNotMatch(iosShortcuts, /Copy cells/);
});

test("iOS Cells copies the grid and Copy stays markdown", () => {
  const table = sliceFn(markdown, "struct MarkdownTableBlock", "private func tableCell");
  assert.match(table, /TableCellsCopy\.showsCells\(completed: completed\)/);
  assert.match(table, /TableCellsCopy\.clipboardText/);
  assert.match(table, /header: table\.header/);
  assert.match(table, /rows: table\.rows/);
  assert.match(table, /TableCellsCopy\.label\(copied: cellsCopied\)/);
  assert.match(table, /TableCellsCopy\.accessibilityLabel\(copied: cellsCopied\)/);
  assert.match(table, /TableCellsCopy\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(table, /TableCellsCopy\.feedbackNanoseconds/);
  assert.match(table, /focusable\(false\)/);
  assert.match(table, /UIPasteboard\.general\.string/);
  assert.match(table, /MarkdownTableCopy\.clipboardText\(table\.source\)/);
  assert.match(tableCopy, /Not tab-separated/);
  assert.match(table, /HStack\(spacing: 12\)/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 224\. v2\.24/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_table_cells_copy\.py/);
  assert.match(pkg, /tableCellsCopy\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
