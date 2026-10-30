// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitMarkdownTables, tableClipboardText } from "./markdownTable.ts";
import { tableCellsClipboardText } from "./tableCellsCopy.ts";
import {
  TABLE_CSV_FILENAME,
  TABLE_CSV_MIME,
  TABLE_CSV_SAVE_ARIA,
  TABLE_CSV_SAVE_LABEL,
  TABLE_CSV_SAVE_MS,
  TABLE_CSV_SAVED_ARIA,
  TABLE_CSV_SAVED_LABEL,
  showTableCsvSave,
  tableCsvSaveAnimates,
  tableCsvSaveAriaLabel,
  tableCsvSaveKeepsTable,
  tableCsvSaveLabel,
  tableCsvText,
} from "./tableCsvSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "tableCsvSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "TableCsvSave.swift"),
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

const PHRASE = "v2.26 save a table as csv";

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
  assert.equal(TABLE_CSV_SAVE_LABEL, "Save");
  assert.equal(TABLE_CSV_SAVED_LABEL, "Saved");
  assert.equal(TABLE_CSV_SAVE_ARIA, "Save table");
  assert.equal(TABLE_CSV_SAVED_ARIA, "Saved");
  assert.equal(TABLE_CSV_SAVE_MS, 1500);
  assert.equal(TABLE_CSV_FILENAME, "table.csv");
  assert.equal(TABLE_CSV_MIME, "text/csv;charset=utf-8");
  assert.equal(tableCsvSaveLabel(false), "Save");
  assert.equal(tableCsvSaveLabel(true), "Saved");
  assert.equal(tableCsvSaveAriaLabel(false), "Save table");
  assert.equal(tableCsvSaveAriaLabel(true), "Saved");
  assert.equal(showTableCsvSave(false), false);
  assert.equal(showTableCsvSave(true), true);
  assert.equal(tableCsvSaveKeepsTable(), true);
  assert.equal(tableCsvSaveAnimates(false), false);
  assert.equal(tableCsvSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save table"/);
  assert.match(swift, /static let filename = "table.csv"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-table/);
  assert.match(src, /Never animate|does not change|Label swap only/);
});

test("csv is the painted grid with quoting, not the markdown or the tabs", () => {
  const parts = splitMarkdownTables(SAMPLE, true);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") return;
  const csv = tableCsvText(parts[0].table.header, parts[0].table.rows);
  assert.equal(csv, "City,Temp\nOslo,12\nLima,21\n");
  assert.equal(csv.includes("---"), false);
  assert.equal(csv.endsWith("\n"), true);
  assert.equal(tableClipboardText(parts[0].table.source), SAMPLE);
  assert.notEqual(csv, tableClipboardText(parts[0].table.source));
  assert.notEqual(
    csv.trimEnd(),
    tableCellsClipboardText(parts[0].table.header, parts[0].table.rows),
  );
});

test("commas, quotes, newlines, tabs, pipes, padding, and dropped cells", () => {
  assert.equal(
    tableCsvText(["Say", "N"], [['He said "hi"', "1"]]),
    'Say,N\n"He said ""hi""",1\n',
  );
  assert.equal(tableCsvText(["A"], [["a,b"]]), 'A\n"a,b"\n');
  assert.equal(tableCsvText(["A"], [["a\nb"]]), 'A\n"a\nb"\n');
  assert.equal(tableCsvText(["A"], [["a\rb"]]), 'A\n"a\rb"\n');
  assert.equal(tableCsvText(["A"], [['say "hi", ok']]), 'A\n"say ""hi"", ok"\n');
  assert.equal(tableCsvText(['"'], []), '""""\n');
  assert.equal(tableCsvText(["A"], [["a\tb"]]), "A\na\tb\n");
  assert.equal(tableCsvText(["A", "B"], [["only"]]), "A,B\nonly,\n");
  assert.equal(tableCsvText(["A"], [["1", "extra"]]), "A\n1\n");
  assert.equal(tableCsvText(["**bold**"], [["x \\| y"]]), "**bold**\nx | y\n");
  assert.equal(tableCsvText([], [["z"]]), "");
  const piped = splitMarkdownTables(
    "| a \\| b | c |\n| --- | --- |\n| 1 | 2 |",
    true,
  );
  assert.equal(piped[0]?.type, "table");
  if (piped[0]?.type !== "table") return;
  assert.equal(
    tableCsvText(piped[0].table.header, piped[0].table.rows),
    "a | b,c\n1,2\n",
  );
  const mixed = splitMarkdownTables(
    "| Item | Note |\n| --- | --- |\n| a, b | x \\| y |",
    true,
  );
  assert.equal(mixed[0]?.type, "table");
  if (mixed[0]?.type !== "table") return;
  assert.equal(
    tableCsvText(mixed[0].table.header, mixed[0].table.rows),
    'Item,Note\n"a, b",x | y\n',
  );
});

test("Save sits beside Copy and Cells and does not replace them", () => {
  const blockSrc = sliceFn(body, "function MarkdownTableBlock", "function tableAlignClass");
  assert.match(blockSrc, /showTableCsvSave\(completed\)/);
  assert.match(blockSrc, /tableCsvText\(table\.header, table\.rows\)/);
  assert.match(blockSrc, /downloadTableCsv\(/);
  assert.match(blockSrc, /TABLE_CSV_FILENAME/);
  assert.match(blockSrc, /tableCsvSaveLabel\(saved\)/);
  assert.match(blockSrc, /aria-label=\{tableCsvSaveAriaLabel\(saved\)\}/);
  assert.match(blockSrc, /className="md-table-save"/);
  assert.match(blockSrc, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(blockSrc, /tableCsvSaveKeepsTable\(\)/);
  const cellsAt = blockSrc.indexOf("tableCellsLabel");
  const copyAt = blockSrc.indexOf("tableCopyLabel");
  const saveAt = blockSrc.indexOf("tableCsvSaveLabel");
  assert.ok(cellsAt >= 0 && cellsAt < copyAt && copyAt < saveAt);
  const copyCall = sliceFn(blockSrc, "function onCopy", "function onCells");
  assert.match(copyCall, /tableClipboardText\(table\.source\)/);
  assert.doesNotMatch(copyCall, /tableCsvText/);
  const cellsCall = sliceFn(blockSrc, "function onCells", "function onSave");
  assert.match(cellsCall, /tableCellsClipboardText\(table\.header, table\.rows\)/);
  assert.doesNotMatch(cellsCall, /tableCsvText/);
  const saveCall = sliceFn(blockSrc, "function onSave", "return (");
  assert.match(saveCall, /tableCsvText\(table\.header, table\.rows\)/);
  assert.doesNotMatch(saveCall, /tableClipboardText/);
  assert.doesNotMatch(saveCall, /tableCellsClipboardText/);
  assert.doesNotMatch(saveCall, /copyText/);
  const save = block(".md-table-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-table-save:focus-visible"), /outline:/);
  const reduceAt = css.indexOf(".md-table-save {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for table save");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 40,
  );
  assert.match(reduce, /\.md-table-save/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /tableCsv/);
  assert.doesNotMatch(user, /md-table-save/);
  const math = sliceFn(body, "function MathNode(", "function FootnoteText(");
  assert.doesNotMatch(math, /showTableCsvSave/);
  assert.doesNotMatch(math, /md-table-save/);
  assert.doesNotMatch(shortcuts, /Save table/);
  assert.doesNotMatch(iosShortcuts, /Save table/);
});

test("iOS Save writes a CSV and Copy and Cells stay", () => {
  const table = sliceFn(markdown, "struct MarkdownTableBlock", "struct MermaidFence");
  assert.match(table, /TableCsvSave\.showsSave\(completed: completed\)/);
  assert.match(table, /TableCsvSave\.csvText/);
  assert.match(table, /header: table\.header/);
  assert.match(table, /rows: table\.rows/);
  assert.match(table, /TableCsvSave\.label\(saved: saved\)/);
  assert.match(table, /TableCsvSave\.accessibilityLabel\(saved: saved\)/);
  assert.match(table, /TableCsvSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(table, /TableCsvSave\.feedbackNanoseconds/);
  assert.match(table, /TableCsvSave\.filename/);
  assert.match(table, /TableCsvSave\.writeFile/);
  assert.match(table, /TableCsvSave\.keepsTable\(\)/);
  assert.match(table, /focusable\(false\)/);
  assert.match(table, /UIActivityViewController/);
  assert.match(table, /MarkdownTableCopy\.clipboardText\(table\.source\)/);
  assert.match(table, /TableCellsCopy\.clipboardText/);
  assert.doesNotMatch(table, /PHPhotoLibrary/);
  const saveCall = sliceFn(table, "private func saveTable", "private func tableCell");
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /TableCsvSave/);
  assert.doesNotMatch(user, /AssistantMarkdown/);
  const iosMath = sliceFn(markdown, "struct MathBlock", "struct MathFallback");
  assert.doesNotMatch(iosMath, /TableCsvSave/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 226\. v2\.26/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_table_csv_save\.py/);
  assert.match(pkg, /tableCsvSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
