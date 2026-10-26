// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
import { applyHardLineBreaks, HARD_BREAK_TOKEN, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import {
  htmlBlockEnd,
  htmlBlockInterrupts,
  htmlBlockStarts,
  htmlLineIsCompleteTag,
  htmlSearchBlockLine,
  htmlSourceBlockLine,
  htmlUntilBlockEnd,
  listSplitByCmarkHtml,
  splitMarkdownLists,
  type ListBlock,
} from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function renderChunk(text: string): string {
  const source = applyHardLineBreaks(literalizeRawHtml(text));
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks],
      children: source,
    }),
  );
}

/** Quote split, then the cmark list split the desktop body uses. */
function shown(text: string): string {
  return splitQuoteAndTasks(text, true)
    .map((part) => {
      if (part.type === "quote") return `<blockquote>${renderLists(part.text)}</blockquote>`;
      if (part.type === "tasks") return part.items.map((item) => renderLists(item.text)).join("");
      return renderLists(part.text);
    })
    .join("");
}

function renderLists(text: string): string {
  if (!listSplitByCmarkHtml(text)) return renderChunk(text);
  return splitMarkdownLists(text, true)
    .map((block) => {
      if (block.type === "markdown") return renderChunk(block.text);
      const lis = block.list.items.map((item) => `<li>${renderChunk(item)}</li>`).join("");
      return block.list.ordered ? `<ol>${lis}</ol>` : `<ul>${lis}</ul>`;
    })
    .join("");
}

function lists(blocks: ListBlock[]) {
  return blocks.flatMap((block) => (block.type === "list" ? [block.list] : []));
}

function items(text: string): string[] {
  return lists(splitMarkdownLists(text, true)).flatMap((list) => list.items);
}

function quoteText(text: string): string | null {
  const block = splitQuoteAndTasks(text, true).find((part) => part.type === "quote");
  return block && block.type === "quote" ? block.text : null;
}

test("cmark-gfm type 1–7 start and end conditions", () => {
  assert.equal(htmlBlockInterrupts("<script>"), true);
  assert.equal(htmlBlockInterrupts("<PRE>"), true);
  assert.equal(htmlBlockInterrupts("<textarea>"), true);
  assert.equal(htmlBlockInterrupts("<STYLE>"), true);
  assert.equal(htmlUntilBlockEnd(["<script>", "*a*", "</pre>", "*b*"], 0, true), 3);
  assert.equal(htmlUntilBlockEnd(["<textarea>", "*a*", "</style>", "*b*"], 0, true), 3);
  assert.equal(htmlUntilBlockEnd(["<SCRIPT>", "x", "</TEXTAREA>"], 0, false), 3);
  assert.equal(htmlBlockEnd(["<!--", "", "bar", "-->", "*b*"], 0, true), 4);
  assert.equal(htmlBlockEnd(["<?php", "*a*", "?>", "*b*"], 0, false), 3);
  assert.equal(htmlBlockEnd(["<![CDATA[", "*a*", "]]>", "*b*"], 0, false), 3);
  assert.equal(htmlBlockEnd(["<!DOCTYPE html>", "*bar*"], 0, false), 1);
  assert.equal(htmlBlockEnd(["<!-- c -->", "*bar*"], 0, true), 1);

  assert.equal(htmlBlockInterrupts("<DIV>"), true);
  assert.equal(htmlBlockInterrupts("<source>"), true);
  assert.equal(htmlBlockInterrupts("<SOURCE>"), true);
  assert.equal(htmlSourceBlockLine("<source lang=js>"), true);
  assert.equal(htmlBlockInterrupts("<search>"), false);
  assert.equal(htmlBlockInterrupts("</search>"), false);
  assert.equal(htmlBlockStarts("<search>"), true);
  assert.equal(htmlBlockStarts("<search"), false);
  assert.equal(htmlBlockStarts("<source"), true);
  assert.equal(htmlSearchBlockLine("<search"), true);
  assert.equal(htmlSearchBlockLine("<Search>"), true);
  assert.equal(htmlBlockInterrupts("<div/>"), true);
  assert.equal(htmlBlockInterrupts("</div/>"), true);
  assert.equal(htmlBlockInterrupts("<div/"), false);
  assert.equal(htmlBlockInterrupts("<div/foo>"), false);
  assert.equal(htmlBlockStarts("</foo/>"), false);
  assert.equal(htmlLineIsCompleteTag('<foo bar="a>b">'), true);
  assert.equal(htmlLineIsCompleteTag('<span class="a>b">'), true);
  assert.equal(htmlBlockStarts('<foo bar="a>b">'), true);
  assert.equal(htmlLineIsCompleteTag("<foo bar=>"), false);
  assert.equal(htmlLineIsCompleteTag("<foo @bar>"), false);
  assert.equal(htmlLineIsCompleteTag("</span bar>"), false);
  assert.equal(htmlLineIsCompleteTag("<span>x</span>"), false);
  assert.equal(htmlBlockStarts("   <div>"), true);
  assert.equal(htmlBlockStarts("    <div>"), false);
  assert.equal(htmlBlockStarts("\t<div>"), false);
  assert.equal(htmlBlockEnd(["<div>", "", "*bar*"], 0, true), 1);
  assert.equal(htmlBlockEnd(["foo", "<br>", "*bar*"], 1, true), null);
  assert.equal(htmlBlockEnd(["<br>", "*bar*"], 0, false), 2);
});

test("margin type 7 ends a list or quote and indented type 7 stays inline", () => {
  assert.deepEqual(items("- foo\n<br>\n*bar*"), ["foo"]);
  assert.deepEqual(items("- foo\n<source>\n*bar*"), ["foo"]);
  assert.deepEqual(items("- foo\n<search>\n*bar*"), ["foo"]);
  assert.deepEqual(items("- foo\n<search\n*bar*"), ["foo\n<search\n*bar*"]);
  assert.deepEqual(items("- foo\n  <br>\n  *bar*"), ["foo\n<br>\n*bar*"]);
  assert.deepEqual(items("- foo\n  <div>\n  *bar*"), ["foo\n<div>\n*bar*"]);
  assert.equal(quoteText("> foo\n<br>\n*bar*"), "foo");
  assert.equal(quoteText("> foo\n<source>\n*bar*"), "foo");
  assert.equal(quoteText("> foo\n> <br>\n> *bar*"), "foo\n<br>\n*bar*");
  assert.equal(listSplitByCmarkHtml("- foo\n<br>\n*bar*"), true);
  assert.equal(listSplitByCmarkHtml("- foo\n<source>\n*bar*"), true);
  assert.equal(listSplitByCmarkHtml("- foo\n<div>\n*bar*"), false);
  assert.equal(listSplitByCmarkHtml("- foo\n  <br>\n  *bar*"), false);
  assert.equal(lists(splitMarkdownLists("foo\n<br>\n9. bar", true)).length, 0);
  assert.equal(splitMarkdownLists("- foo\n<br>\n*bar*", false)[0]?.type, "markdown");
});

test("completed replies render those block boundaries", () => {
  const source = shown("foo\n<source>\n*bar*");
  assert.match(source, /foo/);
  assert.match(source, /&lt;source&gt;/);
  assert.doesNotMatch(source, /<em>/);
  assert.doesNotMatch(source, /<p>\s*<\/p>/);

  const searchOpen = shown("foo\n<search>\n*bar*");
  assert.match(searchOpen, /<em>bar<\/em>/);

  const searchBlock = shown("foo\n\n<search>\n*bar*");
  assert.doesNotMatch(searchBlock, /<em>/);
  assert.match(searchBlock, /&lt;search&gt;/);

  const searchLoose = shown("foo\n<search\n*bar*");
  assert.match(searchLoose, /<em>bar<\/em>/);
  assert.match(searchLoose, /search/);
  assert.doesNotMatch(searchLoose, /<search/);

  const script = shown("<script>\n*a*\n</pre>\n*b*");
  assert.match(script, /<em>b<\/em>/);
  assert.doesNotMatch(script, /<em>a<\/em>/);

  const slash = shown("foo\n<div/foo>\n*bar*");
  assert.match(slash, /<em>bar<\/em>/);

  const self = shown("<div/>\n*bar*");
  assert.doesNotMatch(self, /<em>/);

  const quoted = shown('<foo bar="a>b">\n*bar*');
  assert.doesNotMatch(quoted, /<em>/);

  const badAttr = shown("<foo bar=>\n*bar*");
  assert.match(badAttr, /<em>bar<\/em>/);

  const margin = shown("- foo\n<br>\n*bar*");
  assert.match(margin, /<li><p>foo<\/p><\/li>/);
  assert.match(margin, /&lt;br&gt;/);
  assert.doesNotMatch(margin, /<em>/);

  const indented = shown("- foo\n  <br>\n  *bar*");
  assert.match(indented, /<li>foo/);
  assert.match(indented, /<em>bar<\/em>/);

  const quote = shown("> foo\n<br>\n*bar*");
  assert.match(quote, /<blockquote>/);
  assert.match(quote, /foo/);
  assert.doesNotMatch(quote, /<em>/);

  const paragraph = shown("foo\n<br>\n*bar*");
  assert.match(paragraph, /<em>bar<\/em>/);

  const between = shown("foo\n\n<br>\n\nbar");
  assert.match(between, /<p>foo<\/p>/);
  assert.match(between, /<p>bar<\/p>/);

  const rule = shown("foo\n<br>\n***\nbar");
  assert.match(rule, /<hr/);
  assert.match(rule, /<p>foo/);
  assert.match(rule, /<p>bar<\/p>/);

  assert.equal(splitAssistantBubbles("<script>\n\n</textarea>\n*b*", true).length, 1);
  assert.deepEqual(splitAssistantBubbles("<div>\n\n*bar*", true), ["<div>", "*bar*"]);

  const safe = shown("foo<br>bar");
  assert.match(safe, /foo/);
  assert.match(safe, /<br\s*\/?>/);
  assert.match(literalizeRawHtml("Press <kbd>Ctrl</kbd>"), /§§SBO/);
  assert.match(literalizeRawHtml("<kbd/>"), /§§SBO/);
  assert.doesNotMatch(literalizeRawHtml("<kbd/>"), /<kbd/);
  const filtered = shown("<script>alert(1)</script>\n\nok");
  assert.doesNotMatch(filtered, /<script/i);
  assert.match(filtered, /&lt;script&gt;/);
});

test("literal HTML keeps cmark block text and streaming stays plain", () => {
  assert.equal(
    literalizeRawHtml("foo\n<source>\n*bar*"),
    "foo\n\n<source>\n*bar*",
  );
  const incomplete = literalizeRawHtml("foo\n<source\n*bar*");
  assert.match(incomplete, /foo\n\n/);
  assert.doesNotMatch(incomplete, /<source/);
  assert.match(incomplete, /§§SBE/);
  const openSearch = literalizeRawHtml("foo\n<search>\n*bar*");
  assert.doesNotMatch(openSearch, /<search>/);
  assert.match(openSearch, /\*bar\*/);
  const closedSearch = literalizeRawHtml("foo\n\n<search>\n*bar*");
  assert.match(closedSearch, /<search>\n\*bar\*/);
  const looseSearch = literalizeRawHtml("foo\n<search\n*bar*");
  assert.doesNotMatch(looseSearch, /<search/);
  assert.match(looseSearch, /\*bar\*/);
  assert.equal(literalizeRawHtml("foo\n<source>\n*bar*", false), "foo\n<source>\n*bar*");
  assert.match(literalizeRawHtml("foo\n\n<br>\n\nbar"), /§§SBH§§/);

  const inside = applyHardLineBreaks("- foo\n  <br>\n  bar  \n  baz");
  assert.match(inside, new RegExp(HARD_BREAK_TOKEN));
  const outside = applyHardLineBreaks("- foo\n<br>\nbar  \nbaz");
  assert.doesNotMatch(outside, new RegExp(HARD_BREAK_TOKEN));
  const rawDiv = applyHardLineBreaks("<div>\nfoo  \nbar\n</div>\n");
  assert.doesNotMatch(rawDiv, new RegExp(HARD_BREAK_TOKEN));
});

test("v1.87 stays on OpenAPI 0.18.0 with no new route", () => {
  const roadmap = read(join(root, "ROADMAP.md"));
  const spec = read(join(root, "docs", "specs", "v0.1-chat-and-agents.md"));
  const ci = read(join(root, ".github", "workflows", "ci.yml"));
  const pkg = read(join(here, "..", "package.json"));
  const app = read(join(here, "App.tsx"));
  const list = read(join(here, "markdownList.ts"));
  const swift = read(join(root, "ios", "SnorlaxBot", "MarkdownList.swift"));
  for (const path of ["protocol/openapi.yaml", "runtime/openapi.yaml", "desktop/openapi.yaml"]) {
    const yaml = read(join(root, path));
    assert.match(yaml, /version: 0\.18\.0/);
    assert.doesNotMatch(yaml, /version:\s*0\.19/);
  }
  assert.match(roadmap, /v1\.87 cmark-gfm HTML block edges/);
  assert.match(roadmap, /\/ v1\.87 /);
  assert.match(spec, /## 187\. v1\.87/);
  assert.match(ci, /test_ios_markdown_html_edge\.py/);
  assert.match(pkg, /markdownHtmlEdge\.test\.ts/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(list, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.match(swift, /htmlBlockStarts/);
  assert.match(swift, /"source"/);
  assert.doesNotMatch(swift, /"search"/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
