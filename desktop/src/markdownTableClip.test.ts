// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { neutralizeUnsafeImages } from "./markdownImage.ts";
import { literalizeSetextLines } from "./markdownSetext.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";
import { prepareAngleAutolinks } from "./markdownAutolink.ts";
import { extractMath } from "./math.ts";
import {
  protectTableCellBlocks,
  splitMarkdownTables,
  tableClipboardText,
} from "./markdownTable.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownTable.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
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

const PHRASE = "v1.65 GFM table rows clip to the header in completed assistant replies";

function tableOf(source: string) {
  const parts = splitMarkdownTables(source, true);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") throw new Error("expected a table");
  return parts[0].table;
}

function renderCell(text: string): string {
  const extracted = extractMath(protectTableCellBlocks(literalizeSetextLines(text), true));
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, true),
    true,
  );
  const source = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(mathText, true), true),
      true,
    ),
    true,
  );
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: source,
    }),
  );
}

test("extra cells are dropped and short rows pad to the header", () => {
  const gfm = ["| abc | def |", "| --- | --- |", "| bar |", "| bar | baz | boo |"].join("\n");
  const table = tableOf(gfm);
  assert.deepEqual(table.header, ["abc", "def"]);
  assert.deepEqual(table.align, ["left", "left"]);
  assert.deepEqual(table.rows, [
    ["bar", ""],
    ["bar", "baz"],
  ]);
  assert.equal(tableClipboardText(table.source), gfm);
  assert.match(table.source, /boo/);
  assert.equal(table.rows.some((row) => row.includes("boo")), false);

  const aligned = [
    "| L | C | R |",
    "| :--- | :---: | ---: |",
    "| a | b | c | DROPME |",
    "| only |",
  ].join("\n");
  const shaped = tableOf(aligned);
  assert.deepEqual(shaped.align, ["left", "center", "right"]);
  assert.deepEqual(shaped.header, ["L", "C", "R"]);
  assert.deepEqual(shaped.rows, [
    ["a", "b", "c"],
    ["only", "", ""],
  ]);
  assert.equal(shaped.rows[0]?.length, 3);
  assert.equal(shaped.rows[1]?.length, 3);
  assert.match(shaped.source, /DROPME/);
  assert.equal(tableClipboardText(shaped.source), aligned);

  const kept = tableOf("| `a|b` | **x** |\n| :--- | ---: |\n| 1 | 2 | DROPME |");
  assert.deepEqual(kept.header, ["`a|b`", "**x**"]);
  assert.deepEqual(kept.align, ["left", "right"]);
  assert.deepEqual(kept.rows, [["1", "2"]]);
  assert.match(renderCell(kept.header[0] ?? ""), /<code>a\|b<\/code>/);
  assert.match(renderCell(kept.header[1] ?? ""), /<strong>x<\/strong>/);
  assert.equal(renderCell(kept.rows[0]?.[0] ?? "").includes("DROPME"), false);
});

test("a mismatched delimiter is not a table, and streaming stays plain", () => {
  const mismatch = "| abc | def |\n| --- |\n| bar | baz | boo |";
  const plain = splitMarkdownTables(mismatch, true);
  assert.equal(plain.length, 1);
  assert.equal(plain[0]?.type, "markdown");
  if (plain[0]?.type === "markdown") assert.match(plain[0].text, /boo/);

  const live = "| a | b |\n| --- | --- |\n| 1 | 2 | 3 |";
  const streaming = splitMarkdownTables(live, false);
  assert.equal(streaming.length, 1);
  assert.equal(streaming[0]?.type, "markdown");
  if (streaming[0]?.type === "markdown") assert.equal(streaming[0].text, live);

  const fence = "```\n| a | b |\n| --- | --- |\n| 1 | 2 | 3 |\n```";
  const fenced = splitMarkdownTables(fence, true);
  assert.equal(fenced[0]?.type, "markdown");
});

test("desktop and iOS clip to the header, and OpenAPI stays 0.18.0", () => {
  assert.match(src, /v1\.65/);
  assert.match(src, /const width = header\.length/);
  assert.match(src, /cells\.slice\(0, width\)/);
  assert.doesNotMatch(src, /Math\.max\(width, row\.length\)/);
  assert.match(body, /table\.header\.map\(\(cell, index\)/);
  assert.match(body, /row\.map\(\(cell, index\)/);
  assert.match(body, /className=\{tableAlignClass\(table\.align\[index\]\)\}/);
  assert.match(body, /tableClipboardText\(table\.source\)/);
  assert.match(swift, /v1\.65/);
  assert.match(swift, /let width = header\.count/);
  assert.match(swift, /Array\(cells\.prefix\(width\)\)/);
  assert.match(swift, /while next\.count < width \{ next\.append\(""\) \}/);
  assert.doesNotMatch(swift, /width = max\(width, row\.count\)/);
  assert.match(markdown, /ForEach\(Array\(table\.header\.enumerated\(\)\)/);
  assert.match(markdown, /ForEach\(Array\(row\.enumerated\(\)\)/);
  assert.match(markdown, /gridColumnAlignment\(columnAlign\(column\)\)/);
  assert.match(markdown, /literal\.isEmpty \? " " : literal/);
  assert.match(markdown, /MarkdownTableCopy\.clipboardText\(table\.source\)/);
  assert.match(readFileSync(join(here, "App.tsx"), "utf8"), /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.65 /);
  assert.match(spec, /## 165\. v1\.65/);
  assert.match(spec, /GFM table rows clip to the header in completed assistant replies/);
  assert.match(pkg, /markdownTableClip\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_table_clip\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
