// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractFootnotes } from "./markdownFootnote.ts";
import { markdownListLineRanges, splitMarkdownLists } from "./markdownList.ts";
import { listIsLoose } from "./markdownLooseList.ts";
import { protectLazySetext } from "./markdownSetext.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import {
  containsMarkdownTable,
  splitMarkdownTables,
  splitRow,
} from "./markdownTable.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownTable.ts"), "utf8");
const lists = readFileSync(join(here, "markdownList.ts"), "utf8");
const quote = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownTable.swift"),
  "utf8",
);
const listSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
  "utf8",
);
const quoteSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"),
  "utf8",
);
const app = readFileSync(join(here, "App.tsx"), "utf8");
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

const PHRASE = "v1.86 GFM table edge cases in completed assistant replies";

function tableOf(source: string) {
  const parts = splitMarkdownTables(source, true);
  const table = parts.find((part) => part.type === "table");
  assert.ok(table && table.type === "table");
  if (!table || table.type !== "table") throw new Error("expected a table");
  return table.table;
}

function quoteParts(source: string) {
  const inner = quoteInner(source);
  return splitMarkdownTables(inner, true);
}

function quoteInner(source: string): string {
  const parts = splitQuoteAndTasks(protectLazySetext(source, true), true);
  const quoteBlock = parts.find((part) => part.type === "quote");
  assert.ok(quoteBlock && quoteBlock.type === "quote");
  return quoteBlock.type === "quote" ? quoteBlock.text : "";
}

test("delimiter rules, padding, clipping, and empty cells stay", () => {
  assert.equal(
    splitMarkdownTables("| abc | def |\n| --- |\n| bar |", true)[0]?.type,
    "markdown",
  );
  const aligned = tableOf("| abc | defghi |\n:-: | -----------:\nbar | baz");
  assert.deepEqual(aligned.align, ["center", "right"]);
  assert.deepEqual(aligned.header, ["abc", "defghi"]);
  assert.deepEqual(aligned.rows, [["bar", "baz"]]);
  const shaped = tableOf("| a | b |\n| --- | --- |\n| bar |\n| bar | baz | boo |");
  assert.deepEqual(shaped.rows, [
    ["bar", ""],
    ["bar", "baz"],
  ]);
  assert.match(shaped.source, /boo/);
  const empty = tableOf("| a | b |\n| --- | --- |\n|  |  |");
  assert.deepEqual(empty.rows, [["", ""]]);
  assert.equal(splitMarkdownTables("foo\n---\n", true)[0]?.type, "markdown");
  assert.equal(
    splitMarkdownTables("name | score\n: --- | --- :\nAda | 10", true)[0]?.type,
    "markdown",
  );
});

test("an unescaped pipe inside a code span splits the row", () => {
  const header = splitMarkdownTables("| `a|b` | c |\n| --- | --- |\n| 1 | 2 |", true);
  assert.equal(header[0]?.type, "markdown");
  const doubled = splitMarkdownTables("| ``a|b`` | c |\n| --- | --- |\n| 1 | 2 |", true);
  assert.equal(doubled[0]?.type, "markdown");
  const bodyRow = tableOf("| a | b |\n| --- | --- |\n| `c|d` | e |");
  assert.deepEqual(bodyRow.rows, [["`c", "d`"]]);
  assert.match(bodyRow.source, /\| e \|/);
  const escaped = tableOf("| `a\\|b` | c |\n| --- | --- |\n| 1 | 2 |");
  assert.deepEqual(escaped.header, ["`a|b`", "c"]);
  assert.deepEqual(splitRow("| `a\\|b` | c |"), ["`a|b`", "c"]);
  assert.deepEqual(splitRow("| `a|b` | c |"), ["`a", "b`", "c"]);
});

test("a footnote definition ends the table and a link reference stays", () => {
  const noted = [
    "See [^1].",
    "",
    "| a | b |",
    "| --- | --- |",
    "[^1]: inside",
    "",
    "[^1]: outside",
  ].join("\n");
  const extracted = extractFootnotes(noted, true);
  assert.match(extracted.notes[0]?.text ?? "", /inside/);
  assert.deepEqual(tableOf(extracted.text).rows, []);
  assert.match(extracted.text, /\[\^1\]: outside/);
  const linked = tableOf("| a | b |\n| --- | --- |\n[ref]: https://example.com/in");
  assert.equal(linked.rows.length, 1);
  assert.match(linked.rows[0]?.[0] ?? "", /example\.com\/in/);
});

test("a table stays inside a list, and a lazy row does not", () => {
  const loose = "- foo\n\n  | a | b |\n  | --- | --- |\n  | c | d |";
  const looseParts = splitMarkdownTables(loose, true);
  assert.equal(looseParts.length, 1);
  assert.equal(looseParts[0]?.type, "markdown");
  assert.equal(containsMarkdownTable(loose), true);
  const looseLists = splitMarkdownLists(loose, true);
  assert.equal(looseLists[0]?.type, "list");
  if (looseLists[0]?.type === "list") {
    const nested = splitMarkdownTables(looseLists[0].list.items[0] ?? "", true);
    assert.equal(nested.some((part) => part.type === "table"), true);
  }
  const looseRange = markdownListLineRanges(loose, true)[0];
  assert.ok(looseRange);
  assert.equal(
    listIsLoose(loose.split("\n").slice(looseRange.start, looseRange.end).join("\n"), true),
    true,
  );

  const tight = "- | a | b |\n  | --- | --- |\n  | c | d |";
  const tightLists = splitMarkdownLists(tight, true);
  assert.equal(tightLists[0]?.type, "list");
  if (tightLists[0]?.type === "list") {
    assert.equal(
      splitMarkdownTables(tightLists[0].list.items[0] ?? "", true).some((part) => part.type === "table"),
      true,
    );
  }
  assert.equal(listIsLoose(tight, true), false);

  const withText = "- foo\n  | a | b |\n  | --- | --- |\n  | c | d |";
  const textLists = splitMarkdownLists(withText, true);
  if (textLists[0]?.type === "list") {
    const item = textLists[0].list.items[0] ?? "";
    assert.match(item, /^foo\n/);
    assert.equal(splitMarkdownTables(item, true).some((part) => part.type === "table"), true);
  }
  assert.equal(listIsLoose(withText, true), false);

  const lazyBody = "- | a | b |\n  | --- | --- |\n| c | d |";
  const lists = splitMarkdownLists(lazyBody, true);
  assert.equal(lists[0]?.type, "list");
  if (lists[0]?.type === "list") {
    assert.equal(lists[0].list.items[0], "| a | b |\n| --- | --- |");
    const onlyHeader = splitMarkdownTables(lists[0].list.items[0] ?? "", true);
    const table = onlyHeader.find((part) => part.type === "table");
    assert.ok(table && table.type === "table");
    if (table?.type === "table") assert.deepEqual(table.table.rows, []);
  }
  assert.equal(lists[1]?.type, "markdown");
  if (lists[1]?.type === "markdown") assert.match(lists[1].text, /\| c \| d \|/);

  const lazyDelim = "- | a | b |\n| --- | --- |\n| c | d |";
  assert.equal(containsMarkdownTable(lazyDelim), false);
  const lazyLists = splitMarkdownLists(lazyDelim, true);
  assert.equal(lazyLists.length, 1);
  assert.equal(lazyLists[0]?.type, "list");
});

test("a lazy blockquote does not start a table, and a quoted delimiter does", () => {
  const lazy = "> | a | b |\n| --- | --- |\n| c | d |";
  const lazyParts = quoteParts(lazy);
  assert.equal(lazyParts.some((part) => part.type === "table"), false);
  assert.match(quoteInner(lazy), /§§SBTL§§/);
  assert.equal(
    lazyParts.every((part) => part.type !== "markdown" || !part.text.includes("§§SBTL§§")),
    true,
  );

  const quoted = "> | a | b |\n> | --- | --- |\n| c | d |";
  const quotedBlocks = splitQuoteAndTasks(protectLazySetext(quoted, true), true);
  const quotedQuote = quotedBlocks.find((part) => part.type === "quote");
  assert.ok(quotedQuote && quotedQuote.type === "quote");
  if (quotedQuote?.type === "quote") {
    const inner = splitMarkdownTables(quotedQuote.text, true);
    const table = inner.find((part) => part.type === "table");
    assert.ok(table && table.type === "table");
    if (table?.type === "table") assert.deepEqual(table.table.rows, []);
  }
  const outside = quotedBlocks.find((part) => part.type === "markdown");
  assert.ok(outside && outside.type === "markdown");
  if (outside?.type === "markdown") assert.match(outside.text, /\| c \| d \|/);

  const header = "> foo\n| a | b |\n> | --- | --- |\n> | c | d |";
  const headerParts = quoteParts(header);
  assert.equal(headerParts[0]?.type, "markdown");
  if (headerParts[0]?.type === "markdown") assert.match(headerParts[0].text, /^foo$/);
  const headerTable = headerParts.find((part) => part.type === "table");
  assert.ok(headerTable && headerTable.type === "table");
  if (headerTable?.type === "table") {
    assert.deepEqual(headerTable.table.rows, [["c", "d"]]);
  }

  const inside = "> | a | b |\n> | --- | --- |\n> bar";
  const insideTable = quoteParts(inside).find((part) => part.type === "table");
  assert.ok(insideTable && insideTable.type === "table");
  if (insideTable?.type === "table") assert.deepEqual(insideTable.table.rows, [["bar", ""]]);

  const after = "> | a | b |\n> | --- | --- |\nbar";
  const afterBlocks = splitQuoteAndTasks(protectLazySetext(after, true), true);
  const afterQuote = afterBlocks.find((part) => part.type === "quote");
  assert.ok(afterQuote && afterQuote.type === "quote");
  if (afterQuote?.type === "quote") {
    const inner = splitMarkdownTables(afterQuote.text, true);
    const table = inner.find((part) => part.type === "table");
    assert.ok(table && table.type === "table");
    if (table?.type === "table") assert.deepEqual(table.table.rows, []);
  }
  const afterText = afterBlocks.filter((part) => part.type === "markdown");
  assert.match(
    afterText.map((part) => (part.type === "markdown" ? part.text : "")).join("\n"),
    /^bar$/,
  );
});

test("streaming stays source, and OpenAPI stays 0.18.0", () => {
  const live = "| a | b |\n| --- | --- |\n| `c|d` | e |";
  const streaming = splitMarkdownTables(live, false);
  assert.equal(streaming.length, 1);
  assert.equal(streaming[0]?.type, "markdown");
  if (streaming[0]?.type === "markdown") assert.equal(streaming[0].text, live);
  assert.match(src, /v1\.86/);
  assert.match(src, /isFootnoteDefinition/);
  assert.match(src, /quoteLineInTable/);
  assert.match(src, /markdownListEnd/);
  assert.match(src, /if \(ch === "\|"\)/);
  assert.match(src, /code = 0/);
  assert.match(lists, /LAZY_CONTINUATION_MARK/);
  assert.match(lists, /lazyLineEndsItem/);
  assert.match(quote, /quoteLineInTable/);
  assert.match(quote, /LAZY_CONTINUATION_MARK/);
  assert.match(body, /textHasTableInList/);
  assert.match(body, /TightParagraphContext/);
  assert.match(body, /<ol start=\{start\}>/);
  assert.match(swift, /v1\.86/);
  assert.match(swift, /isFootnoteDefinition/);
  assert.match(swift, /quoteLineInTable/);
  assert.match(swift, /MarkdownList\.listEnd/);
  assert.match(swift, /code = 0/);
  assert.match(listSwift, /lazyContinuationMark/);
  assert.match(quoteSwift, /quoteLineInTable/);
  assert.match(quoteSwift, /lazyContinuationMark/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.86 /);
  assert.match(spec, /## 186\. v1\.86/);
  assert.match(spec, /GFM table edge cases in completed assistant replies/);
  assert.match(pkg, /markdownTableEdge\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_table_edge\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
