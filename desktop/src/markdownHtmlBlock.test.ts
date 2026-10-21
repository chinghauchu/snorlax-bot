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
import { splitMarkdownLists, type ListBlock } from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownList.ts"), "utf8");
const quotes = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const bubbles = readFileSync(join(here, "assistantBubbles.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
  "utf8",
);
const quoteSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"),
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

const PHRASE = "v1.58 CommonMark HTML blocks in completed assistant replies";

function html(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
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

test("react-markdown ends a list or quote at an HTML block", () => {
  const div = html("- foo\n<div>\nbar\n</div>");
  assert.match(div, /<ul>\s*<li>foo<\/li>\s*<\/ul>/);
  assert.match(div, /&lt;div&gt;/);
  assert.equal(div.match(/<li>/g)?.length, 1);

  const star = html("* foo\n<div>\n* bar");
  assert.equal(star.match(/<li>/g)?.length, 1);
  assert.match(star, /<li>foo<\/li>/);
  assert.match(star, /\* bar/);

  const comment = html("- foo\n<!-- x -->\nbar");
  assert.match(comment, /<li>foo<\/li>/);
  assert.match(comment, /<p>bar<\/p>/);
  assert.equal(comment.match(/<li>/g)?.length, 1);

  const br = html("- foo\n<br>\nbar");
  assert.match(br, /<li>foo\s*&lt;br&gt;\s*<\/li>/);
  assert.match(br, /<p>bar<\/p>/);
  assert.match(html("- foo\n<br/>\nbar"), /&lt;br\/&gt;/);
  assert.match(html("- foo\n<BR>\nbar"), /&lt;BR&gt;/);
  assert.match(html("- foo\n  <br>\n  bar"), /<li>foo\s*&lt;br&gt;\s*bar<\/li>/);
  assert.doesNotMatch(html("- foo\n<span>x</span>\nbar"), /<p>bar<\/p>/);

  assert.match(html("foo\n<!-- c -->\n9. bar"), /<ol start="9">\s*<li>bar<\/li>/);
  const style = html("foo\n<style>\n9. not\n</style>\n9. yes");
  assert.match(style, /<li>yes<\/li>/);
  assert.doesNotMatch(style, /<li>not<\/li>/);
  assert.doesNotMatch(html("foo\n<div>\n9. not\n</div>\n9. yes"), /<ol/);
  assert.match(html("foo\n<div>\n9. not\n\n9. yes"), /<ol start="9">\s*<li>yes<\/li>/);
  assert.doesNotMatch(html("foo\n<br>\n9. bar"), /<ol/);
  assert.match(html("foo\n\n<br>\n\n9. bar"), /<ol start="9">/);

  const quote = html("> foo\n<div>\nbar");
  assert.match(quote, /<blockquote>\s*<p>foo<\/p>\s*<\/blockquote>/);
  assert.match(quote, /&lt;div&gt;/);
  const lazyBr = html("> foo\n<br>\nbar");
  assert.match(lazyBr, /<blockquote>[\s\S]*&lt;br&gt;[\s\S]*<\/blockquote>\s*<p>bar<\/p>/);
  assert.match(html("> foo\nbar"), /<blockquote>\s*<p>foo\s*bar<\/p>\s*<\/blockquote>/);
  assert.match(html("- foo\nbar"), /<li>foo\s*bar<\/li>/);
  assert.equal(html("- a\n* b").match(/<ul>/g)?.length, 2);
  assert.doesNotMatch(html("foo\n9. bar"), /<ol/);
});

test("the list and quote split follows that HTML block rule", () => {
  assert.deepEqual(items("- foo\n<div>\nbar\n</div>"), ["foo"]);
  assert.match(
    splitMarkdownLists("- foo\n<div>\nbar\n</div>", true)
      .filter((block) => block.type === "markdown")
      .map((block) => (block.type === "markdown" ? block.text : ""))
      .join("\n"),
    /<div>/,
  );
  assert.deepEqual(items("* foo\n<div>\n* bar"), ["foo"]);
  assert.equal(lists(splitMarkdownLists("* foo\n<div>\n* bar", true)).length, 1);
  assert.deepEqual(items("- foo\n<!-- x -->\nbar"), ["foo"]);
  assert.deepEqual(items("- foo\n<br>\nbar"), ["foo\n<br>"]);
  assert.deepEqual(items("- foo\n<br/>\nbar"), ["foo\n<br/>"]);
  assert.deepEqual(items("- foo\n<BR>\nbar"), ["foo\n<BR>"]);
  assert.deepEqual(items("- foo\n  <br>\n  bar"), ["foo\n<br>\nbar"]);
  assert.deepEqual(items("- foo\n<span>x</span>\nbar"), ["foo\n<span>x</span>\nbar"]);
  assert.deepEqual(items("- foo\n<br>\n  bar"), ["foo\n<br>\nbar"]);

  const afterComment = lists(splitMarkdownLists("foo\n<!-- c -->\n9. bar", true));
  assert.equal(afterComment.length, 1);
  assert.equal(afterComment[0]?.start, 9);
  assert.deepEqual(afterComment[0]?.items, ["bar"]);
  const afterStyle = lists(splitMarkdownLists("foo\n<style>\n9. not\n</style>\n9. yes", true));
  assert.deepEqual(afterStyle[0]?.items, ["yes"]);
  assert.equal(lists(splitMarkdownLists("foo\n<div>\n9. not\n</div>\n9. yes", true)).length, 0);
  const afterBlank = lists(splitMarkdownLists("foo\n<div>\n9. not\n\n9. yes", true));
  assert.deepEqual(afterBlank[0]?.items, ["yes"]);
  assert.equal(lists(splitMarkdownLists("foo\n<br>\n9. bar", true)).length, 0);
  assert.equal(lists(splitMarkdownLists("foo\n\n<br>\n\n9. bar", true))[0]?.start, 9);

  assert.equal(quoteText("> foo\n<div>\nbar"), "foo");
  assert.equal(quoteText("> foo\n<br>\nbar"), "foo\n<br>");
  assert.equal(quoteText("> foo\nbar"), "foo\nbar");
  assert.equal(quoteText("> foo\n<!-- c -->\nbar"), "foo");
  assert.deepEqual(items("- foo\nbar"), ["foo\nbar"]);
  assert.equal(lists(splitMarkdownLists("- a\n* b", true)).length, 2);
  assert.equal(lists(splitMarkdownLists("foo\n9. bar", true)).length, 0);
  assert.deepEqual(items("1. foo\nbar\n<div>\n9. baz"), ["foo\nbar"]);
  assert.equal(lists(splitMarkdownLists("* foo\n<hr>\n* bar", true)).length, 1);
  assert.deepEqual(items("* foo\n<hr>\n* bar"), ["foo"]);
  assert.equal(lists(splitMarkdownLists("```\n<div>\n9. bar\n```", true)).length, 0);
  assert.equal(lists(splitMarkdownLists("foo\n<!--\n\n- item\n-->", true)).length, 0);

  const tasks = splitQuoteAndTasks("- [ ] task\n<div>\nmore", true);
  assert.equal(tasks[0]?.type, "tasks");
  if (tasks[0]?.type === "tasks") assert.deepEqual(tasks[0].items.map((item) => item.text), ["task"]);
  const mixed = splitQuoteAndTasks("- [ ] a\n* [x] b", true);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0]?.type, "tasks");
});

test("blank lines inside an until-block stay in one bubble", () => {
  assert.deepEqual(splitAssistantBubbles("foo\n<!--\n\n9. not\n-->\n9. yes", true), [
    "foo\n<!--\n\n9. not\n-->\n9. yes",
  ]);
  assert.deepEqual(splitAssistantBubbles("foo\n<div>\n\nbar", true), ["foo\n<div>", "bar"]);
  assert.deepEqual(splitAssistantBubbles("```\n<!--\n\nbar\n-->\n```", true), [
    "```\n<!--\n\nbar\n-->\n```",
  ]);
  assert.deepEqual(splitMarkdownLists("- foo\n<div>\nbar", false), [
    { type: "markdown", text: "- foo\n<div>\nbar" },
  ]);
  assert.deepEqual(splitQuoteAndTasks("> foo\n<div>\nbar", false), [
    { type: "markdown", text: "> foo\n<div>\nbar" },
  ]);
});

test("streaming stays plain and copy keeps markdown source", () => {
  assert.match(src, /htmlBlockInterrupts/);
  assert.match(src, /htmlLazyTag/);
  assert.match(src, /export function htmlUntilBlockEnd/);
  assert.match(src, /v1\.58/);
  assert.match(quotes, /htmlBlockInterrupts/);
  assert.match(quotes, /htmlLazyTag/);
  assert.match(bubbles, /htmlUntilBlockEnd/);
  assert.match(swift, /htmlBlockInterrupts/);
  assert.match(swift, /htmlLazyTag/);
  assert.match(swift, /htmlUntilBlockEnd/);
  assert.match(swift, /v1\.58/);
  assert.match(swift, /if !completed \{ return \[.markdown\(src\)\] \}/);
  assert.match(quoteSwift, /MarkdownList\.htmlBlockInterrupts/);
  assert.match(quoteSwift, /MarkdownList\.htmlLazyTag/);
  assert.match(markdown, /MarkdownList\.htmlUntilBlockEnd/);
  assert.match(body, /react-markdown/);
  assert.doesNotMatch(body, /rehype-raw/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.58 /);
  assert.match(spec, /## 158\. v1\.58/);
  assert.match(spec, /CommonMark HTML blocks in completed assistant replies/);
  assert.match(ci, /test_ios_markdown_html_block\.py/);
  assert.match(pkg, /markdownHtmlBlock\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane/);
  assert.doesNotMatch(swift, /computerPane/);
});
