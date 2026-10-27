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
import { headingInlineSource, splitSetextHeadings } from "./markdownSetext.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownSetext.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSetext.swift"),
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
  "v1.83 CommonMark hard line breaks inside setext headings in completed assistant replies";

function headingText(text: string): string | null {
  const block = splitSetextHeadings(text, true).find((part) => part.type === "heading");
  return block?.type === "heading" ? block.text : null;
}

/** Same hard-break order the heading inline renderer uses. */
function paint(text: string): string {
  const once = headingInlineSource(text);
  const source = applyHardLineBreaks(protectMarkdownEscapes(once, true), true);
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      children: source,
    }),
  );
  return restoreMarkdownEscapes(html).replace(/<\/?p>/g, "");
}

function paragraph(text: string): string {
  const source = applyHardLineBreaks(protectMarkdownEscapes(text, true), true);
  return restoreMarkdownEscapes(
    renderToStaticMarkup(
      React.createElement(Markdown, {
        remarkPlugins: [remarkHardBreaks],
        children: source,
      }),
    ),
  );
}

test("a plain newline inside a setext heading is a soft break", () => {
  assert.equal(headingText("Foo\nbar\n===\n"), "Foo\nbar");
  assert.equal(headingInlineSource("Foo\nbar"), "Foo\nbar");
  const html = paint("Foo\nbar");
  assert.match(html, /Foo\nbar/);
  assert.doesNotMatch(html, /<br/);
});

test("two trailing spaces or a backslash are a hard break and are not shown", () => {
  assert.equal(headingText("Foo  \nbar\n===\n"), "Foo  \nbar");
  const spaced = headingInlineSource("Foo  \nbar");
  assert.equal(spaced, "Foo§§SBH§§bar");
  assert.equal(applyHardLineBreaks(spaced, true), spaced);
  const spacedHtml = paint("Foo  \nbar");
  assert.match(spacedHtml, /Foo<br\/>\nbar/);
  assert.doesNotMatch(spacedHtml, /Foo {2}/);

  assert.equal(headingText("Foo\\\nbar\n===\n"), "Foo\\\nbar");
  assert.equal(headingInlineSource("Foo\\\nbar"), "Foo§§SBH§§bar");
  const slashHtml = paint("Foo\\\nbar");
  assert.match(slashHtml, /Foo<br\/>\nbar/);
  assert.doesNotMatch(slashHtml, /\\/);

  const even = paint("Foo\\\\\nbar");
  assert.match(even, /Foo\\\nbar/);
  assert.doesNotMatch(even, /<br/);

  const triple = paint("Foo\\\\\\\nbar");
  assert.match(triple, /Foo\\<br\/>\nbar/);
});

test("the line before the underline is the end of the block", () => {
  assert.equal(headingText("Foo  \n===\n"), "Foo");
  assert.equal(paint("Foo"), "Foo");
  assert.doesNotMatch(paint("Foo"), /<br/);

  assert.equal(headingText("Foo\\\n===\n"), "Foo\\");
  const kept = paint("Foo\\");
  assert.match(kept, /Foo\\/);
  assert.doesNotMatch(kept, /<br/);

  assert.equal(headingText("Foo  \nbar\\\n===\n"), "Foo  \nbar\\");
  const mixed = paint("Foo  \nbar\\");
  assert.match(mixed, /Foo<br\/>\nbar\\/);
});

test("emphasis and code spans keep their own break rules", () => {
  const hard = paint("Foo *bar  \nbaz*");
  assert.match(hard, /Foo <em>bar<br\/>\nbaz<\/em>/);
  const soft = paint("Foo *bar\nbaz*");
  assert.match(soft, /Foo <em>bar\nbaz<\/em>/);
  assert.doesNotMatch(soft, /<br/);

  assert.equal(headingText("Foo `a  \nb`\n===\n"), "Foo `a  \nb`");
  assert.equal(headingInlineSource("Foo `a  \nb`"), "Foo `a   b`");
  assert.match(paint("Foo `a  \nb`"), /Foo <code>a {3}b<\/code>/);
  assert.doesNotMatch(paint("Foo `a  \nb`"), /<br/);

  assert.equal(headingInlineSource("Foo `a\\\nb`"), "Foo `a\\ b`");
  assert.match(paint("Foo `a\\\nb`"), /Foo <code>a\\ b<\/code>/);

  assert.equal(headingText("Foo `a\n    b`\n===\n"), "Foo `a\nb`");
  assert.match(paint("Foo `a\nb`"), /Foo <code>a b<\/code>/);
});

test("leading indent and a trailing tab run follow cmark-gfm", () => {
  assert.equal(headingText("Foo\n   bar\n===\n"), "Foo\nbar");
  assert.doesNotMatch(paint("Foo\nbar"), /<br/);

  assert.equal(headingText("Foo \nbar\n===\n"), "Foo\nbar");
  assert.equal(headingText("Foo  \t\nbar\n===\n"), "Foo\nbar");
  assert.doesNotMatch(paint("Foo\nbar"), /<br/);

  assert.equal(headingText("Foo\t  \nbar\n===\n"), "Foo  \nbar");
  assert.match(paint("Foo  \nbar"), /Foo<br\/>\nbar/);
  assert.equal(headingText("Foo\tbar  \nbaz\n===\n"), "Foo\tbar  \nbaz");
  assert.match(paint("Foo\tbar  \nbaz"), /Foo\tbar<br\/>\nbaz/);
});

test("a quote heading uses the same breaks and a list heading still does", () => {
  const quote = splitQuoteAndTasks("> Foo  \n> bar\n> ===\n", true);
  assert.equal(quote[0]?.type, "quote");
  if (quote[0]?.type === "quote") {
    assert.equal(headingText(`${quote[0].text}\n`), "Foo  \nbar");
    assert.match(paint("Foo  \nbar"), /Foo<br\/>\nbar/);
  }
  const quotedSlash = splitQuoteAndTasks("> Foo\\\n> bar\n> ===\n", true);
  assert.equal(quotedSlash[0]?.type, "quote");
  if (quotedSlash[0]?.type === "quote") {
    assert.equal(headingText(`${quotedSlash[0].text}\n`), "Foo\\\nbar");
  }

  const hardList = paragraph("- Foo  \n  bar\n  ===\n");
  assert.match(hardList, /<h1>Foo<br\/>\s*bar<\/h1>/);
  const softList = paragraph("- Foo\n  bar\n  ===\n");
  assert.match(softList, /<h1>Foo\nbar<\/h1>/);
  assert.doesNotMatch(softList, /<br/);
});

test("streaming stays plain and this cut stays clients-only", () => {
  const live = "Foo  \nbar\n===\n";
  assert.deepEqual(splitSetextHeadings(live, false), [{ type: "markdown", text: live }]);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(src, /v1\.83/);
  assert.match(src, /return applyHardLineBreaks\(escapeHeadingBlockLines\(text\), true\)/);
  assert.match(src, /if \(spaces >= 2\)/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /v1\.83/);
  assert.match(
    swift,
    /MarkdownHardBreak\.apply\(escapeHeadingBlockLines\(text\), completed: true\)/,
  );
  assert.match(swift, /if spaces >= 2/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.83 /);
  assert.match(spec, /## 183\. v1\.83/);
  assert.match(spec, /hard line breaks inside setext headings/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_setext_break\.py/);
  assert.match(pkg, /markdownSetextBreak\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.equal(src.includes("computerPane"), false);
});
