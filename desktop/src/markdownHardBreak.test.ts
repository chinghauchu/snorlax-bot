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
import {
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import { extractFootnotes } from "./markdownFootnote.ts";
import {
  applyHardLineBreaks,
  HARD_BREAK_TOKEN,
  remarkHardBreaks,
  splitHardBreakToken,
} from "./markdownHardBreak.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { splitMarkdownTables } from "./markdownTable.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownHardBreak.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownHardBreak.swift"),
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

const PHRASE =
  "v1.41 CommonMark hard line breaks in completed assistant replies";

function render(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      children: text,
    }),
  );
}

function prepared(source: string, completed = true): string {
  return applyHardLineBreaks(protectMarkdownEscapes(source, completed), completed);
}

function html(source: string): string {
  return restoreMarkdownEscapes(render(prepared(source, true)));
}

function textOf(markup: string): string {
  return restoreMarkdownEscapes(markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

test("two or more spaces, or a backslash, break the line and are not shown", () => {
  const spaces = html("foo  \nbar");
  assert.match(spaces, /foo<br\s*\/?>\s*bar/);
  assert.equal(textOf(spaces), "foo bar");
  assert.doesNotMatch(spaces, /foo {2}/);
  const many = html("foo    \nbar");
  assert.match(many, /foo<br\s*\/?>\s*bar/);
  const slash = html("foo\\\nbar");
  assert.match(slash, /foo<br\s*\/?>\s*bar/);
  assert.equal(textOf(slash), "foo bar");
  assert.doesNotMatch(textOf(slash), /\\/);
  const kept = html("foo  \\\nbar");
  assert.match(kept, /foo {2}<br\s*\/?>\s*bar/);
  assert.match(html("*foo  \nbar*"), /<em>foo<br\s*\/?>\s*bar<\/em>/);
  assert.match(html("[a\\\nb](https://example.com)"), /<a [^>]*>a<br\s*\/?>\s*b<\/a>/);
  assert.match(html("foo  \n        bar"), /foo<br\s*\/?>\s*bar/);
});

test("a plain newline is a soft break and renders as a space", () => {
  const soft = html("foo\nbar");
  assert.doesNotMatch(soft, /<br/);
  assert.equal(textOf(soft), "foo bar");
  assert.match(soft, /<p>foo\nbar<\/p>/);
  const one = html("foo \nbar");
  assert.doesNotMatch(one, /<br/);
  assert.equal(textOf(one), "foo bar");
  const tab = html("foo\t\nbar");
  assert.doesNotMatch(tab, /<br/);
  assert.match(src, /soft break/);
  assert.match(src, /renders as a space/);
  assert.match(swift, /soft break/);
});

test("markers at the end of a block are not a break", () => {
  const spaces = html("foo  \n\nbar");
  assert.doesNotMatch(spaces, /<br/);
  assert.equal(textOf(spaces), "foo bar");
  const slash = html("foo\\\n\nbar");
  assert.doesNotMatch(slash, /<br/);
  assert.equal(textOf(slash), "foo\\ bar");
  assert.equal(textOf(html("foo  ")), "foo");
  assert.equal(textOf(html("foo\\")), "foo\\");
  assert.equal(textOf(html("foo\\\n")), "foo\\");
  assert.match(html("### foo\\\nbar"), /<h3>foo\\<\/h3>/);
  assert.doesNotMatch(html("### foo  \nbar"), /<br/);
  assert.match(html("foo  \n---"), /<h2>foo<\/h2>/);
  assert.match(html("foo\\\n---"), /<h2>foo\\<\/h2>/);
  assert.match(html("foo  \nbar\n---"), /<h2>foo<br\s*\/?>\s*bar<\/h2>/);
  assert.match(html("foo\\\n# bar"), /<p>foo\\<\/p>\s*<h1>bar<\/h1>/);
  assert.doesNotMatch(html("foo  \n- bar"), /<br/);
  assert.match(html("foo  \n- bar"), /<ul>/);
});

test("code, math, tables, and HTML keep hard-break markers literal", () => {
  const span = html("`code  \nspan`");
  assert.doesNotMatch(span, /<br/);
  assert.match(span, /<code>code {3}span<\/code>/);
  const spanSlash = html("`code\\\nspan`");
  assert.match(spanSlash, /<code>code\\ span<\/code>/);
  const fence = html("```\nfoo  \nbar\\\nbaz\n```");
  assert.doesNotMatch(fence, /<br/);
  assert.match(fence, /foo {2}/);
  assert.match(fence, /bar\\/);
  const indented = html("\n    foo  \n    bar\\\n");
  assert.doesNotMatch(indented, /<br/);
  assert.match(indented, /foo {2}/);
  const around = html("x `a  \nb` y  \nz");
  assert.match(around, /<code>a {3}b<\/code> y<br\s*\/?>\s*z/);
  const math = extractMath("foo  \nbar \\(a\\\\\nb\\) baz\\\nqux");
  const mathHtml = render(applyHardLineBreaks(math.text, true));
  assert.match(mathHtml, /foo<br\s*\/?>\s*bar/);
  assert.match(mathHtml, /baz<br\s*\/?>\s*qux/);
  assert.match(math.slots[0]?.tex ?? "", /\\\\/);
  assert.equal(applyHardLineBreaks(math.slots[0]?.raw ?? "", false), math.slots[0]?.raw);
  const table = "| a  | b |\n| --- | --- |\n| c\\ | d |";
  const parts = splitMarkdownTables(table, true);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") return;
  assert.equal(parts[0].table.source, table);
  assert.equal(applyHardLineBreaks(table, true).includes(HARD_BREAK_TOKEN), false);
  const glued = html("hello  \n| a | b |\n| --- | --- |\n| c | d |");
  assert.match(glued, /hello<br/);
  assert.doesNotMatch(glued, /<table/);
  const div = html("<div>\nfoo  \nbar\n</div>\n\nnext");
  assert.doesNotMatch(div, /<br/);
  assert.match(div, /foo {2}/);
  const tag = html('<a href="foo  \nbar">');
  assert.doesNotMatch(tag, /<br/);
  assert.match(tag, /foo {2}/);
});

test("lists, quotes, escapes, and strikethrough stay consistent", () => {
  assert.match(html("- foo  \n  bar"), /<li>foo<br\s*\/?>\s*bar<\/li>/);
  assert.match(html("- foo\\\nbar"), /<li>foo<br\s*\/?>\s*bar<\/li>/);
  assert.doesNotMatch(html("- foo  \n  - nested"), /<br/);
  assert.match(html("1. foo  \n2. bar"), /<li>foo<\/li>\s*<li>bar<\/li>/);
  assert.match(html("foo  \n2. bar"), /foo<br\s*\/?>\s*2\. bar/);
  assert.match(html("1. foo  \n   1. bar"), /<ol>/);
  const quote = splitQuoteAndTasks("> foo  \n> bar", true);
  assert.equal(quote[0]?.type, "quote");
  if (quote[0]?.type !== "quote") return;
  assert.match(html(quote[0].text), /foo<br\s*\/?>\s*bar/);
  assert.match(html("> foo  \n>   bar"), /foo<br\s*\/?>\s*bar/);
  const even = prepared("foo\\\\\nbar");
  assert.equal(even.includes(HARD_BREAK_TOKEN), false);
  assert.match(html("foo\\\\\nbar"), /foo\\/);
  assert.doesNotMatch(html("foo\\\\\nbar"), /<br/);
  const triple = html("foo\\\\\\\nbar");
  assert.match(triple, /foo\\<br\s*\/?>\s*bar/);
  const struck = html("~~foo  \nbar~~");
  assert.doesNotMatch(struck, /<del/);
  assert.match(struck, /~~foo<br\s*\/?>\s*bar~~/);
  assert.match(html("~~yes~~"), /<del class="md-strike">yes<\/del>/);
  const linked = resolveReferenceLinks("See [ref]  \nnow.\n\n[ref]: https://example.com/a", true);
  assert.match(html(linked), /<br/);
  assert.match(html(linked), /href="https:\/\/example.com\/a"/);
  const noted = extractFootnotes("See [^1]  \nnow.\n\n[^1]: note", true);
  assert.equal(noted.notes.length, 1);
  assert.match(html(noted.text), /<br/);
});

test("streaming stays literal and copy keeps markdown source", () => {
  const raw = "foo  \\\nbar \\* &amp;";
  assert.equal(applyHardLineBreaks(raw, false), raw);
  assert.equal(prepared(raw, false), raw);
  assert.equal(splitHardBreakToken(`a${HARD_BREAK_TOKEN}b`)?.join("|"), "a|b");
  assert.equal(splitHardBreakToken("plain"), null);
  assert.match(body, /applyHardLineBreaks\(\s*protectMarkdownEscapes\(mathText, completed\),\s*completed,\s*\)/);
  assert.match(body, /remarkHardBreaks, remarkStrikethrough/);
  assert.equal(body.split("remarkHardBreaks, remarkStrikethrough").length, 3);
  const protectAt = body.indexOf("protectMarkdownEscapes(mathText, completed)");
  const hardAt = body.indexOf("applyHardLineBreaks(");
  assert.ok(protectAt > hardAt);
  assert.match(markdown, /MarkdownHardBreak.apply\(escaped, completed: completed\)/);
  assert.match(markdown, /MarkdownHardBreak.restore\(parsed\)/);
  const escapeAt = markdown.indexOf("MarkdownEscape.protect(src, completed: completed)");
  const hardCall = markdown.indexOf("MarkdownHardBreak.apply(escaped, completed: completed)");
  const restoreEsc = markdown.indexOf("MarkdownEscape.restore(parsed)");
  const restoreHard = markdown.indexOf("MarkdownHardBreak.restore(parsed)");
  assert.ok(escapeAt >= 0 && hardCall > escapeAt);
  assert.ok(restoreEsc >= 0 && restoreHard > restoreEsc);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /applyHardLineBreaks\(reply\.content/);
  assert.match(src, /markdown source/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.match(swift, /static func apply\(_ text: String, completed: Bool/);
  assert.match(swift, /if !completed \|\| text.isEmpty \{ return text \}/);
  assert.match(swift, /§§SBH§§/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.41 /);
  assert.match(spec, /## 141\. v1\.41/);
  assert.match(spec, /soft break/i);
  assert.match(ci, /test_ios_markdown_hard_break\.py/);
  assert.match(pkg, /markdownHardBreak\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane/);
  assert.doesNotMatch(swift, /computerPane/);
});
