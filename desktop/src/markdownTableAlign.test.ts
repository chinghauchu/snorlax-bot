// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import {
  splitMarkdownTables,
  splitRow,
  tableClipboardText,
} from "./markdownTable.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownTable.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownTable.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
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
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");

const PHRASE =
  "v1.55 GFM table alignment and escaped pipes in completed assistant replies";

function render(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function visible(source: string): string {
  const html = render(protectMarkdownEscapes(source, true));
  return restoreMarkdownEscapes(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function tableOf(source: string) {
  const parts = splitMarkdownTables(source, true);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") throw new Error("expected a table");
  return parts[0].table;
}

test("delimiter colons set left, center, and right", () => {
  const source = [
    "| City | Temp | Note |",
    "| :--- | :---: | ---: |",
    "| Oslo | 12 | cold |",
  ].join("\n");
  const table = tableOf(source);
  assert.deepEqual(table.align, ["left", "center", "right"]);
  assert.deepEqual(table.header, ["City", "Temp", "Note"]);
  assert.deepEqual(table.rows, [["Oslo", "12", "cold"]]);
  assert.deepEqual(splitRow("| :--- | :---: | ---: |"), [":---", ":---:", "---:"]);
  const bare = tableOf("name | score | note\n:--- | :---: | ---:\nAda | 10 | ok");
  assert.deepEqual(bare.align, ["left", "center", "right"]);
});

test("an escaped pipe stays one cell, including inside inline code", () => {
  const outside = tableOf("| a \\| b | c |\n| --- | --- |\n| 1 | 2 |");
  assert.deepEqual(outside.header, ["a \\| b", "c"]);
  assert.equal(visible(outside.header[0] ?? ""), "a | b");
  assert.equal(tableClipboardText(outside.source), outside.source);
  assert.match(outside.source, /\\\|/);

  const inside = tableOf("| `a\\|b` | c |\n| --- | --- |\n| 1 | 2 |");
  assert.deepEqual(inside.header, ["`a|b`", "c"]);
  assert.match(render(inside.header[0] ?? ""), /<code>a\|b<\/code>/);
  assert.doesNotMatch(inside.header[0] ?? "", /\\/);
  assert.match(inside.source, /\\\|/);
  assert.equal(tableClipboardText(inside.source), inside.source);

  const spaced = splitRow("| ` \\| ` | c |");
  assert.deepEqual(spaced, ["` | `", "c"]);
  assert.match(render(spaced?.[0] ?? ""), /<code>\|<\/code>/);

  const multi = splitRow("| ``a \\| b`` | c |");
  assert.deepEqual(multi, ["``a | b``", "c"]);

  const kept = splitRow("| `a\\\\|b` | c |");
  assert.deepEqual(kept, ["`a\\|b`", "c"]);
  assert.match(render(kept?.[0] ?? ""), /<code>a\\\|b<\/code>/);

  const star = splitRow("| `a\\*b` | c |");
  assert.deepEqual(star, ["`a\\*b`", "c"]);

  const plainCode = splitMarkdownTables("| `a|b` | c |\n| --- | --- |\n| 1 | 2 |", true);
  assert.equal(plainCode[0]?.type, "markdown");

  const aligned = tableOf(
    ["| L | C | R |", "| :--- | :---: | ---: |", "| `x\\|y` | m | n |"].join("\n"),
  );
  assert.deepEqual(aligned.align, ["left", "center", "right"]);
  assert.deepEqual(aligned.rows, [["`x|y`", "m", "n"]]);
});

test("streaming stays source, and fences are not tables", () => {
  const live = "| `a\\|b` | c |\n| :--- | :---: |\n| 1 | 2 |";
  const parts = splitMarkdownTables(live, false);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "markdown");
  if (parts[0]?.type === "markdown") assert.equal(parts[0].text, live);
  const fence = "```\n| `a\\|b` | c |\n| --- | --- |\n| 1 | 2 |\n```";
  const fenced = splitMarkdownTables(fence, true);
  assert.equal(fenced.length, 1);
  assert.equal(fenced[0]?.type, "markdown");
  if (fenced[0]?.type === "markdown") assert.match(fenced[0].text, /\\\|/);
});

test("desktop and iOS share alignment and the code-span pipe, and OpenAPI stays 0.18.0", () => {
  assert.match(src, /v1\.55/);
  assert.match(src, /ch === "\\\\" && \(body\[i \+ 1\] \?\? ""\) === "\|"/);
  assert.match(body, /tableAlignClass\(table\.align\[index\]\)/);
  assert.match(body, /if \(align === "center"\) return "md-table-center"/);
  assert.match(body, /if \(align === "right"\) return "md-table-right"/);
  assert.match(body, /return "md-table-left"/);
  assert.match(body, /tableClipboardText\(table\.source\)/);
  assert.match(css, /\.md-table th,\s*\n\.md-table td \{[^}]*text-align:\s*left/);
  assert.match(css, /\.md-table-center \{[^}]*text-align:\s*center/);
  assert.match(css, /\.md-table-right \{[^}]*text-align:\s*right/);
  assert.match(swift, /v1\.55/);
  assert.match(swift, /chars\[index \+ 1\] == "\|"/);
  assert.match(swift, /current\.append\("\|"\)/);
  assert.match(swift, /if left && right \{ align\.append\(\.center\) \}/);
  assert.match(swift, /else if right \{ align\.append\(\.right\) \}/);
  assert.match(markdown, /gridColumnAlignment\(columnAlign\(column\)\)/);
  assert.match(markdown, /case \.left: return \.leading/);
  assert.match(markdown, /case \.center: return \.center/);
  assert.match(markdown, /case \.right: return \.trailing/);
  assert.match(markdown, /MarkdownTableCopy\.clipboardText\(table\.source\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, /v1\.55 GFM table alignment and escaped pipes in completed assistant replies/);
  assert.match(roadmap, /\/ v1\.55 /);
  assert.match(spec, /## 155\. v1\.55/);
  assert.match(spec, /GFM table alignment and escaped pipes in completed assistant replies/);
  assert.match(pkg, /markdownTableAlign\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_table_align\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
