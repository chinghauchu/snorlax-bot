// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitIndentedCode } from "./markdownIndentedCode.ts";
import { splitQuoteAndTasks, stripQuoteMarker } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
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
  "v1.73 CommonMark tab stops for blockquotes in completed assistant replies";

function html(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function decode(text: string): string {
  return text
    .replace(/&#x9;/gi, "\t")
    .replace(/&#9;/g, "\t")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** Ignore markup whitespace. A newline inside a text node still counts. */
function norm(text: string): string {
  return decode(text).replace(/>\s+</g, "><").replace(/\n/g, "");
}

function escapeCode(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Completed-reply quote path: split quotes, then indented code, then cmark. */
function pipeline(text: string): string {
  return splitQuoteAndTasks(text, true)
    .map((block) => {
      if (block.type === "quote") return `<blockquote>${pipeline(block.text)}</blockquote>`;
      if (block.type === "tasks") {
        return block.items
          .map((item) => `<li>${item.checked ? "x" : " "}${item.text}</li>`)
          .join("");
      }
      return splitIndentedCode(block.text, true)
        .map((part) => {
          if (part.type === "code") {
            const body = part.source.endsWith("\n") ? part.source : `${part.source}\n`;
            return `<pre><code>${escapeCode(body)}</code></pre>`;
          }
          return html(part.text);
        })
        .join("");
    })
    .join("");
}

function quoteText(source: string): string {
  const block = splitQuoteAndTasks(source, true).find((part) => part.type === "quote");
  assert.ok(block && block.type === "quote");
  return block.text;
}

test("a blockquote tab stop matches cmark-gfm", () => {
  const cases = [
    ">\t\tfoo\n",
    ">\t\t\tfoo\n",
    ">\t\t\t\tfoo\n",
    ">\t\t\t\t\tfoo\n",
    ">\tfoo\n",
    "> \tfoo\n",
    "> \t\tfoo\n",
    " >\t\tfoo\n",
    "  >\t\tfoo\n",
    "   >\t\tfoo\n",
    "\t> foo\n",
    "    > foo\n",
    ">>\t\tfoo\n",
    ">\t>\t\tfoo\n",
    ">\t>\t\t\tfoo\n",
    "> >\t\t\tfoo\n",
    ">>>\t\tfoo\n",
    "> > >\t\tfoo\n",
    ">-\t\tfoo\n",
    ">-\t\t\tfoo\n",
    "> -\t\tfoo\n",
    "> -\t\t\tfoo\n",
    ">\t-\t\tfoo\n",
    ">\t-\t\t\tfoo\n",
    ">1.\t\tfoo\n",
    ">\t10.\t\tfoo\n",
    ">\t10.\t\t\tfoo\n",
    "> - item\n>\n>\t\t\tcode\n",
    ">\t- item\n>\n>\t\t\tcode\n",
    "> - item\n>\t\tcode\n",
    "> foo\n>\t\tbar\n",
    "> foo\n>\t\t\tbar\n",
    ">\t```\n>\tcode\n>\t```\n",
    ">\t```\n>\t\tline\n>\t```\n",
    ">\t```js\n>\t\tline\tX\n>\t```\n",
    "> ```\n>\t\tcode\n> ```\n",
    ">\t\t```\n>\t\tcode\n>\t\t```\n",
    ">\tbar\tbaz\n",
    ">\t\n",
    ">\t\t\n",
    "> quoted text\n",
    ">quoted\n",
    "   > indented\n",
    ">> nested\n",
    "> - item\n>   child\n",
    "> foo\n>\t9. bar\n",
    ">\t$$\n>\tx\n>\t$$\n",
    "> $$\n>\t\tx\n> $$\n",
    "> foo\n>\t\tbar\n>\n> baz\n",
    ">\t# heading\n",
    ">\t---\n",
    "> - foo\n>\n>\t\tbar\n",
    ">\t- foo\n>\n>\t\tbar\n",
    ">1. foo\n>\n>\t\tbar\n",
    ">1. foo\n>\n>\t\t\tbar\n",
    ">1.\tfoo\n>\n>\t\tbar\n",
    ">- foo\n>\n>\t\tbar\n",
    ">-\tfoo\n>\n>\t\tbar\n",
    ">- item\n>\n>\t\t\tcode\n",
    ">-\titem\n>\n>\t\t\tcode\n",
    ">-\n>\t\tfoo\n",
    ">1.\n>\t\tfoo\n",
    ">1.\n>\n>\t\tfoo\n",
    ">1. foo\n>\n>\n>\t\t\tbar\n",
    ">\t- item\n>\n>\n>\t\t\tcode\n",
    ">>\t- item\n>>\n>>\t\t\tcode\n",
    ">>1. foo\n>>\n>>\t\t\tbar\n",
    "> *\t\tstar\n",
    "> +\t\tplus\n",
    "> 9)\t\tten\n",
    ">\t9)\t\tten\n",
    "> foo\n>\n>\t\tcode\n",
    "> - empty\n>\n>\t\tcode\n",
    ">\t\tfoo\n>\t\tbar\n",
    "> - item\n>\n>\t\t\tcode\n>\t\t\tmore\n",
  ];
  assert.match(html(">\t\tfoo\n"), /<pre><code> {2}foo\n<\/code><\/pre>/);
  for (const source of cases) {
    assert.equal(norm(pipeline(source)), norm(html(source)), JSON.stringify(source));
  }
  assert.equal(quoteText(">\t\tfoo\n"), "      foo");
  assert.equal(stripQuoteMarker(">\t\tfoo"), "      foo");
  assert.equal(stripQuoteMarker(">\t\t\tfoo"), "      \tfoo");
});

test("a line with no tab keeps the old quote strip", () => {
  assert.equal(stripQuoteMarker("> quoted text"), "quoted text");
  assert.equal(stripQuoteMarker(">quoted"), "quoted");
  assert.equal(stripQuoteMarker("   > indented"), "indented");
  assert.equal(stripQuoteMarker(">> nested"), "> nested");
  assert.equal(stripQuoteMarker("    > code"), null);
  assert.equal(quoteText("> quoted text\n>> nested"), "quoted text\n> nested");
  assert.equal(quoteText("> - item\n>   child"), "- item\n  child");
  assert.equal(quoteText(">>> foo\n> bar\n>>baz\n"), ">> foo\nbar\n>baz");
  assert.equal(quoteText(">\t- [x]\tdone\n"), "  - [x]\tdone");
});

test("streaming stays the markdown string and copy stays the source", () => {
  const live = ">\t\tfoo\n";
  assert.deepEqual(splitQuoteAndTasks(live, false), [{ type: "markdown", text: live }]);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /clipboard|copyText|UIPasteboard/);
  assert.doesNotMatch(plain, /quoteContentColumn|renderQuoteLine/);
  assert.match(markdown, /MarkdownQuoteTask\.split\(/);
});

test("docs, CI, and OpenAPI record v1.73 without a new route", () => {
  assert.match(src, /v1\.73/);
  assert.match(src, /function quoteContentColumn/);
  assert.match(src, /contentCol \+ openList\.relative/);
  assert.match(swift, /v1\.73/);
  assert.match(swift, /func quoteContentColumn/);
  assert.match(swift, /contentCol \+ openList\.relative/);
  assert.match(swift, /MarkdownList\.listItemIndentedCode/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.73 /);
  assert.match(spec, /## 173\. v1\.73/);
  assert.match(spec, /tab stops for blockquotes/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_quote_tab\.py/);
  assert.match(pkg, /markdownQuoteTab\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
