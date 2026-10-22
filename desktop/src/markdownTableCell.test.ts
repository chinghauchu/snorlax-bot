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
  splitRow,
  tableCellInlineAnimates,
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

const PHRASE = "v1.64 GFM table cells stay inline in completed assistant replies";

function pipeline(text: string, completed = true): string {
  const extracted = extractMath(
    protectTableCellBlocks(literalizeSetextLines(text), completed),
  );
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, completed),
    completed,
  );
  return promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(mathText, completed), completed),
      completed,
    ),
    completed,
  );
}

function renderCell(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: pipeline(text, true),
    }),
  );
}

function shown(text: string): string {
  return restoreMarkdownEscapes(renderCell(text).replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

test("inline formatting stays, and block starts stay characters", () => {
  const bold = renderCell("**bold**");
  assert.match(bold, /<strong>bold<\/strong>/);
  assert.equal(shown("*italic*"), "italic");
  assert.match(renderCell("*italic*"), /<em>italic<\/em>/);
  assert.match(renderCell("`code`"), /<code>code<\/code>/);
  const link = renderCell("[docs](https://example.com)");
  assert.match(link, /href="https:\/\/example.com"/);
  assert.match(link, />docs</);
  const both = renderCell("***both***");
  assert.match(both, /<strong>/);
  assert.match(both, /<em>/);
  assert.equal(shown("***both***"), "both");
  assert.equal(protectTableCellBlocks("***both***"), "***both***");
  assert.equal(protectTableCellBlocks("**bold**"), "**bold**");
  assert.equal(protectTableCellBlocks("`code`"), "`code`");

  assert.equal(shown("- item"), "- item");
  assert.doesNotMatch(renderCell("- item"), /<ul/);
  assert.equal(protectTableCellBlocks("- item"), "\\- item");
  assert.equal(shown("* item"), "* item");
  assert.doesNotMatch(renderCell("* item"), /<ul/);
  assert.equal(shown("+ item"), "+ item");
  assert.equal(shown("# Title"), "# Title");
  assert.doesNotMatch(renderCell("# Title"), /<h1/);
  assert.equal(protectTableCellBlocks("# Title"), "\\# Title");
  assert.equal(protectTableCellBlocks("#foo"), "#foo");
  assert.equal(shown("> quoted"), "> quoted");
  assert.doesNotMatch(renderCell("> quoted"), /<blockquote/);
  const ordered = renderCell("1. **a**");
  assert.doesNotMatch(ordered, /<ol/);
  assert.match(ordered, /<strong>a<\/strong>/);
  assert.equal(shown("1. **a**"), "1. a");
  assert.equal(protectTableCellBlocks("1. **a**"), "1\\. **a**");
  assert.equal(shown("12) next"), "12) next");
  assert.doesNotMatch(renderCell("12) next"), /<ol/);
  assert.equal(protectTableCellBlocks("1234567890. no"), "1234567890. no");

  assert.equal(shown("***"), "***");
  assert.doesNotMatch(renderCell("***"), /<hr/);
  assert.equal(protectTableCellBlocks("* * *"), "\\* \\* \\*");
  assert.equal(shown("* * *"), "* * *");
  assert.doesNotMatch(renderCell("* * *"), /<hr/);
  assert.equal(shown("___"), "___");
  assert.doesNotMatch(renderCell("___"), /<hr/);
  assert.equal(shown("==="), "===");
  assert.equal(shown("---"), "---");
  assert.doesNotMatch(renderCell("---"), /<hr/);

  assert.equal(shown("```"), "```");
  assert.doesNotMatch(renderCell("```"), /<pre/);
  assert.equal(protectTableCellBlocks("```js"), "\\`\\`\\`js");
  assert.equal(shown("```code```"), "code");
  assert.match(renderCell("```code```"), /<code>code<\/code>/);
  assert.equal(protectTableCellBlocks("```code```"), "```code```");

  assert.equal(shown("~~gone~~"), "gone");
  assert.match(renderCell("~~gone~~"), /<del/);
  assert.equal(shown("~gone~"), "gone");
  assert.equal(shown("snake_case_name"), "snake_case_name");
  assert.doesNotMatch(renderCell("snake_case_name"), /<em>/);
  assert.equal(shown("foo*bar*baz"), "foobarbaz");
  assert.match(renderCell("foo*bar*baz"), /foo<em>bar<\/em>baz/);
  assert.equal(protectTableCellBlocks("snake_case_name"), "snake_case_name");
  assert.equal(protectTableCellBlocks("foo*bar*baz"), "foo*bar*baz");
});

test("escaped pipes and code-span pipes still stay one formatted cell", () => {
  const source = ["| - item | **a \\| b** |", "| --- | --- |", "| `a|b` | [go](https://example.com) |"].join(
    "\n",
  );
  const parts = splitMarkdownTables(source, true);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") return;
  assert.equal(tableClipboardText(parts[0].table.source), source);
  assert.match(parts[0].table.source, /\\\|/);
  assert.deepEqual(parts[0].table.header, ["- item", "**a \\| b**"]);
  assert.deepEqual(parts[0].table.rows, [["`a|b`", "[go](https://example.com)"]]);
  assert.equal(protectTableCellBlocks(parts[0].table.header[0] ?? ""), "\\- item");
  assert.equal(protectTableCellBlocks(parts[0].table.header[1] ?? ""), "**a \\| b**");
  const bold = restoreMarkdownEscapes(renderCell(parts[0].table.header[1] ?? ""));
  assert.match(bold, /<strong>a \| b<\/strong>/);
  assert.equal(shown(parts[0].table.header[1] ?? ""), "a | b");
  assert.match(renderCell(parts[0].table.rows[0]?.[0] ?? ""), /<code>a\|b<\/code>/);
  assert.match(renderCell(parts[0].table.rows[0]?.[1] ?? ""), /href="https:\/\/example.com"/);
  assert.deepEqual(splitRow("| `a|b` | c |"), ["`a|b`", "c"]);
  assert.deepEqual(splitRow("| **a \\| b** | c |"), ["**a \\| b**", "c"]);
});

test("streaming stays source, and OpenAPI stays 0.18.0", () => {
  assert.equal(protectTableCellBlocks("- item", false), "- item");
  assert.equal(protectTableCellBlocks("# Title", false), "# Title");
  assert.equal(protectTableCellBlocks(""), "");
  assert.equal(tableCellInlineAnimates(false), false);
  assert.equal(tableCellInlineAnimates(true), false);
  const live = "| - item | **bold** |\n| --- | --- |\n| # T | 1 |";
  const parts = splitMarkdownTables(live, false);
  assert.equal(parts[0]?.type, "markdown");
  if (parts[0]?.type === "markdown") assert.equal(parts[0].text, live);

  assert.match(src, /v1\.64/);
  assert.match(src, /export function protectTableCellBlocks/);
  assert.match(src, /export function tableCellInlineAnimates/);
  assert.match(body, /protectTableCellBlocks\(literalizeSetextLines\(text\), completed\)/);
  assert.match(body, /literalizeSetextLines\(text\)/);
  assert.match(swift, /v1\.64/);
  assert.match(swift, /static func protectCellBlocks/);
  assert.match(swift, /static func cellInlineAnimation/);
  assert.match(swift, /return nil/);
  assert.match(markdown, /MarkdownTable\.protectCellBlocks/);
  assert.match(markdown, /MarkdownSetext\.literalize\(text\)/);
  assert.match(markdown, /cellInlineAnimation\(reduceMotion: reduceMotion\)/);
  assert.match(appCopy(), /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.64 /);
  assert.match(spec, /## 164\. v1\.64/);
  assert.match(spec, /GFM table cells stay inline in completed assistant replies/);
  assert.match(pkg, /markdownTableCell\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_table_cell\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});

function appCopy(): string {
  return readFileSync(join(here, "App.tsx"), "utf8");
}
