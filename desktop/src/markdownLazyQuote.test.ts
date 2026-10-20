// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitThematicBreaks } from "./markdownBreak.ts";
import { splitMarkdownLists } from "./markdownList.ts";
import { protectLazySetext, splitSetextHeadings } from "./markdownSetext.ts";
import {
  quoteTaskAnimates,
  splitQuoteAndTasks,
} from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const plain = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MidStreamPlaintext.swift"),
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
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE =
  "v1.47 CommonMark lazy blockquote continuation in completed assistant replies";

function quoteBlocks(text: string, completed = true) {
  return splitQuoteAndTasks(protectLazySetext(text, completed), completed);
}

function quoteText(text: string): string {
  const parts = quoteBlocks(text);
  const quote = parts.find((part) => part.type === "quote");
  assert.ok(quote && quote.type === "quote");
  return quote.type === "quote" ? quote.text : "";
}

test("a quote paragraph keeps the next line that has no marker", () => {
  const parts = quoteBlocks("> quoted\nstill quoted\n");
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "quote");
  assert.equal(quoteText("> quoted\nstill quoted\n"), "quoted\nstill quoted");
  const html = renderToStaticMarkup(
    React.createElement(Markdown, { children: quoteText("> quoted\nstill quoted\n") }),
  );
  assert.match(html, /<p>quoted\nstill quoted<\/p>/);
  assert.equal(
    quoteText("> a\nb\n> c\nd\n"),
    "a\nb\nc\nd",
  );
  assert.equal(quoteText("   > foo\nbar\n"), "foo\nbar");
  assert.equal(quoteText("> foo\n#bar\n"), "foo\n#bar");
  assert.equal(quoteText("> foo\n-bar\n"), "foo\n-bar");
});

test("nested quotes keep a lazy continuation on the inside", () => {
  const outer = quoteText("> > > foo\nbar\n");
  assert.equal(outer, "> > foo\nbar");
  const mid = quoteText(outer);
  assert.equal(mid, "> foo\nbar");
  assert.equal(quoteText(mid), "foo\nbar");
  assert.equal(quoteText(">>> foo\n> bar\n>>baz\n"), ">> foo\nbar\n>baz");
  assert.equal(quoteText(quoteText(">>> foo\n> bar\n>>baz\n")), "> foo\nbar\nbaz");
  assert.equal(quoteText(quoteText(quoteText(">>> foo\n> bar\n>>baz\n"))), "foo\nbar\nbaz");
});

test("a blank line, a heading, a list, a fence, or a rule ends the quote", () => {
  const blank = quoteBlocks("> bar\n\nbaz\n");
  assert.equal(blank[0]?.type, "quote");
  assert.equal(blank[0]?.type === "quote" ? blank[0].text : "", "bar");
  assert.match(blank[1]?.type === "markdown" ? blank[1].text : "", /baz/);

  const heading = quoteBlocks("> foo\n# bar\n");
  assert.equal(heading[0]?.type === "quote" ? heading[0].text : "", "foo");
  assert.match(heading[1]?.type === "markdown" ? heading[1].text : "", /# bar/);

  const list = quoteBlocks("> - foo\n- bar\n");
  assert.equal(list[0]?.type === "quote" ? list[0].text : "", "- foo");
  assert.match(list[1]?.type === "markdown" ? list[1].text : "", /- bar/);

  const ordered = quoteBlocks("> foo\n2. bar\n");
  assert.equal(ordered[0]?.type === "quote" ? ordered[0].text : "", "foo");
  assert.match(ordered[1]?.type === "markdown" ? ordered[1].text : "", /2\. bar/);

  const fence = quoteBlocks("> foo\n```\ncode\n```\n");
  assert.equal(fence[0]?.type === "quote" ? fence[0].text : "", "foo");
  assert.match(fence.map((part) => (part.type === "markdown" ? part.text : "")).join("\n"), /```/);
  assert.doesNotMatch(fence[0]?.type === "quote" ? fence[0].text : "", /code/);

  const rule = quoteBlocks("> foo\n---\n");
  assert.equal(rule[0]?.type === "quote" ? rule[0].text : "", "foo");
  const rest = rule.slice(1).map((part) => (part.type === "markdown" ? part.text : "")).join("\n");
  assert.equal(splitThematicBreaks(rest, true).some((part) => part.type === "rule"), true);

  const task = quoteBlocks("> quote\n- [ ] later\n");
  assert.equal(task[0]?.type === "quote" ? task[0].text : "", "quote");
  assert.equal(task[1]?.type, "tasks");
});

test("a list item inside the quote keeps a plain continuation", () => {
  const inner = quoteText("> 1. foo\nbar\n");
  assert.equal(inner, "1. foo\nbar");
  const lists = splitMarkdownLists(inner, true);
  assert.equal(lists.length, 1);
  assert.equal(lists[0]?.type, "list");
  if (lists[0]?.type === "list") {
    assert.equal(lists[0].list.ordered, true);
    assert.equal(lists[0].list.items[0], "foo\nbar");
  }
  assert.equal(quoteText("> - foo\n  bar\n"), "- foo\n  bar");
  const outside = quoteBlocks("> - \nbar\n");
  assert.equal(outside[0]?.type === "quote" ? outside[0].text : "", "- ");
  assert.match(outside[1]?.type === "markdown" ? outside[1].text : "", /bar/);
});

test("a lazy setext underline stays text inside the quote", () => {
  const lazy = "> foo\nbar\n===\n";
  const text = quoteText(lazy);
  assert.match(text, /foo/);
  assert.match(text, /bar/);
  assert.match(text, /===/);
  assert.equal(splitSetextHeadings(text, true).some((part) => part.type === "heading"), false);
  const equals = quoteText("> foo\n===\n");
  assert.match(equals, /foo/);
  assert.match(equals, /===/);
  assert.equal(splitSetextHeadings(equals, true).some((part) => part.type === "heading"), false);

  const code = quoteBlocks(`>${" ".repeat(5)}foo\n${" ".repeat(4)}bar\n`);
  assert.equal(code[0]?.type === "quote" ? code[0].text : "", `${" ".repeat(4)}foo`);
  assert.match(code[1]?.type === "markdown" ? code[1].text : "", /^ {4}bar\n?$/);
});

test("fences, math, and a streaming bubble stay literal", () => {
  const fence = "```\n> quoted\nstill\n```\n";
  assert.equal(quoteBlocks(fence).length, 1);
  assert.equal(quoteBlocks(fence)[0]?.type, "markdown");
  const math = "$$\n> quoted\nstill\n$$\n";
  assert.equal(quoteBlocks(math)[0]?.type, "markdown");
  const live = "> quoted\nstill quoted\n";
  assert.deepEqual(splitQuoteAndTasks(live, false), [{ type: "markdown", text: live }]);
  assert.equal(quoteTaskAnimates(false), false);
  assert.equal(quoteTaskAnimates(true), false);
  const display = quoteBlocks("> foo\nbar\n$$\nmath\n$$\n");
  assert.equal(display[0]?.type === "quote" ? display[0].text : "", "foo\nbar");
  assert.match(
    display.map((part) => (part.type === "markdown" ? part.text : "")).join("\n"),
    /\$\$/,
  );
});

test("docs, CI, and OpenAPI record v1.47 without a new route", () => {
  assert.match(src, /v1\.47/);
  assert.match(src, /lazy continuation/);
  assert.match(src, /function endsLazyQuote/);
  assert.match(src, /function paragraphOpenAfter/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /v1\.47/);
  assert.match(swift, /lazy continuation/);
  assert.match(swift, /func endsLazyQuote/);
  assert.match(swift, /func paragraphOpenAfter/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(body, /splitQuoteAndTasks\(protectLazySetext\(text, completed\), completed\)/);
  assert.match(body, /className="md-quote"/);
  assert.match(markdown, /MarkdownQuoteTask\.split\(/);
  assert.doesNotMatch(plain, /endsLazyQuote/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(app, /shouldRenderMarkdown/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.47 /);
  assert.match(spec, /## 147\. v1\.47/);
  assert.match(spec, /lazy blockquote continuation in completed assistant replies/i);
  assert.match(spec, /footnotes already shipped/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_lazy_quote\.py/);
  assert.match(pkg, /markdownLazyQuote\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
