// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough, splitThematicBreaks } from "./markdownBreak.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { remarkHardBreaks } from "./markdownHardBreak.ts";
import {
  headingInlineSource,
  literalizeSetextLines,
  protectLazySetext,
  setextAnimates,
  splitSetextHeadings,
} from "./markdownSetext.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownSetext.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSetext.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const brk = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownBreak.swift"),
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
  "v1.44 CommonMark setext headings in completed assistant replies";

function headingHtml(level: 1 | 2, text: string): string {
  const tag = level === 1 ? "h1" : "h2";
  const inner = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      children: protectMarkdownEscapes(headingInlineSource(text), true),
    }),
  ).replace(/<\/?p>/g, "");
  return `<${tag}>${restoreBreaks(inner)}</${tag}>`;
}

function restoreBreaks(html: string): string {
  return html.replaceAll("§§SBH§§", "<br/>");
}

function paragraphHtml(text: string): string {
  const prepared = protectMarkdownEscapes(text, true);
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks],
      children: prepared,
    }),
  );
  return restoreMarkdownEscapes(html);
}

test("equals is h1 and dashes are h2, same elements as ATX", () => {
  const h1 = splitSetextHeadings("Foo\n===\n", true);
  assert.deepEqual(h1, [{ type: "heading", level: 1, text: "Foo" }]);
  assert.match(headingHtml(1, "Foo"), /<h1>Foo<\/h1>/);
  const h2 = splitSetextHeadings("Foo *bar*\n---\n", true);
  assert.equal(h2[0]?.type, "heading");
  if (h2[0]?.type === "heading") {
    assert.equal(h2[0].level, 2);
    assert.match(headingHtml(2, h2[0].text), /<h2>Foo <em>bar<\/em><\/h2>/);
  }
  assert.match(css, /\.assistant-md h1 \{[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.assistant-md h2 \{[\s\S]*font-size:\s*14px/);
  assert.equal(setextAnimates(false), false);
  assert.equal(setextAnimates(true), false);
});

test("a multi-line paragraph followed by === is one heading", () => {
  const blocks = splitSetextHeadings("Foo *bar\nbaz*\n====\n", true);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.type, "heading");
  if (blocks[0]?.type === "heading") {
    assert.equal(blocks[0].level, 1);
    assert.equal(blocks[0].text, "Foo *bar\nbaz*");
    const html = headingHtml(1, blocks[0].text);
    assert.match(html, /<h1>Foo <em>bar/);
    assert.match(html, /<em>bar\nbaz<\/em>/);
    assert.doesNotMatch(html, /<br/);
    assert.doesNotMatch(html, /====/);
  }
  const plain = splitSetextHeadings("Foo\nBar\n---\nbaz\n", true);
  assert.equal(plain[0]?.type, "heading");
  assert.equal(plain[1]?.type, "markdown");
  if (plain[0]?.type === "heading") assert.equal(plain[0].text, "Foo\nBar");
});

test("a blank line makes --- a thematic break, not a heading", () => {
  const blocks = splitSetextHeadings("Foo\n\n---\n", true);
  assert.equal(blocks.some((part) => part.type === "heading"), false);
  const chunk = blocks.map((part) => (part.type === "markdown" ? part.text : "")).join("\n");
  const rules = splitThematicBreaks(chunk, true);
  assert.equal(rules.some((part) => part.type === "rule"), true);
  const alone = splitSetextHeadings("===\n", true);
  assert.equal(alone[0]?.type, "markdown");
});

test("list items and paragraph continuations follow the spec", () => {
  const after = splitSetextHeadings("- Foo\n---\n", true);
  assert.equal(after.some((part) => part.type === "heading"), false);
  const rules = splitThematicBreaks("- Foo\n---\n", true);
  assert.equal(rules.at(-1)?.type, "rule");

  const inside = splitSetextHeadings("- Foo\n  ---\n", true);
  assert.equal(inside.some((part) => part.type === "heading"), false);
  const kept = splitThematicBreaks("- Foo\n  ---\n", true);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.type, "markdown");
  if (kept[0]?.type === "markdown") {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, { children: kept[0].text }),
    );
    assert.match(html, /<li>\s*<h2>Foo<\/h2>\s*<\/li>/);
    assert.doesNotMatch(html, /<hr/);
  }

  const continued = splitThematicBreaks("- Foo\n  continued\n---\n", true);
  assert.equal(continued.at(-1)?.type, "rule");

  const nested = splitSetextHeadings("- Foo\n  bar\n  ===\n", true);
  assert.equal(nested.some((part) => part.type === "heading"), false);
});

test("lazy continuation and a backslash-escaped equals stay literal", () => {
  const lazy = "> foo\nbar\n===\n";
  const protectedLazy = protectLazySetext(lazy, true);
  assert.match(protectedLazy, /\\===/);
  const afterQuote = protectedLazy.split("\n").slice(1).join("\n");
  const blocks = splitSetextHeadings(afterQuote, true);
  assert.equal(blocks.some((part) => part.type === "heading"), false);
  const html = paragraphHtml(afterQuote);
  assert.match(html, /===/);
  assert.doesNotMatch(html, /<h1/);

  const escaped = "Foo\n\\===\n";
  assert.equal(protectLazySetext(escaped, true), escaped);
  const plain = splitSetextHeadings(escaped, true);
  assert.equal(plain[0]?.type, "markdown");
  const escapedHtml = paragraphHtml(escaped);
  assert.match(escapedHtml, /===/);
  assert.doesNotMatch(escapedHtml, /<h1/);

  const quoteHeading = splitSetextHeadings("> Foo\n> ---\n", true);
  assert.equal(quoteHeading.some((part) => part.type === "heading"), false);
  assert.equal(protectLazySetext("> Foo\n---\n", true).includes("\\---"), false);
});

test("fences, indented code, math, and table cells stay literal", () => {
  const fence = "```\nFoo\n===\n```\n";
  assert.equal(protectLazySetext(fence, true), fence);
  const fenced = splitSetextHeadings(fence, true);
  assert.equal(fenced.length, 1);
  assert.equal(fenced[0]?.type, "markdown");

  const indented = "    Foo\n    ---\n";
  const code = splitSetextHeadings(indented, true);
  assert.equal(code[0]?.type, "markdown");
  if (code[0]?.type === "markdown") {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, { children: code[0].text }),
    );
    assert.match(html, /<code>Foo\n---/);
    assert.doesNotMatch(html, /<h2/);
  }

  const math = "$$\n===\n$$\n";
  const mathBlocks = splitSetextHeadings(math, true);
  assert.equal(mathBlocks.some((part) => part.type === "heading"), false);
  assert.match(mathBlocks.map((part) => (part.type === "markdown" ? part.text : "")).join("\n"), /===/);

  assert.equal(literalizeSetextLines("Foo\n==="), "Foo\n\\===");
  assert.equal(literalizeSetextLines("---"), "\\---");
  assert.equal(literalizeSetextLines("hello"), "hello");
  const cell = paragraphHtml(literalizeSetextLines("Foo\n==="));
  assert.match(cell, /===/);
  assert.doesNotMatch(cell, /<h1/);
});

test("streaming stays plain and copy still uses markdown source", () => {
  const live = "Foo\n===\n";
  assert.equal(protectLazySetext(live, false), live);
  assert.deepEqual(splitSetextHeadings(live, false), [
    { type: "markdown", text: live },
  ]);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(body, /protectLazySetext\(text, completed\)/);
  assert.match(body, /splitSetextHeadings\(text, completed\)/);
  assert.match(body, /headingInlineSource\(text\)/);
  assert.match(body, /literalizeSetextLines\(text\)/);
  assert.match(body, /data-animate=\{animate \? "1" : undefined\}/);
  assert.match(body, /level === 1 \? "h1" : "h2"/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /static func protectLazy/);
  assert.match(swift, /static func split/);
  assert.match(swift, /static func literalize/);
  assert.match(swift, /static func headingInlineSource/);
  assert.match(swift, /return nil/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(markdown, /MarkdownSetext.protectLazy/);
  assert.match(markdown, /MarkdownSetext.split/);
  assert.match(markdown, /MarkdownSetext.literalize/);
  assert.match(markdown, /headingLevel: level/);
  assert.match(markdown, /accessibilityAddTraits\(\.isHeader\)/);
  assert.match(markdown, /level <= 1 \? metrics\.heading : metrics\.body/);
  assert.match(brk, /MarkdownList\.listEnd/);
  assert.match(brk, /htmlBlockLineEnd/);
});

test("docs, CI, and OpenAPI stay put", () => {
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.44 /);
  assert.match(spec, /## 144\. v1\.44/);
  assert.match(spec, /CommonMark setext headings in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_setext\.py/);
  assert.match(pkg, /markdownSetext\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
