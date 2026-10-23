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
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import {
  protectLazySetext,
  splitSetextHeadings,
  type SetextBlock,
} from "./markdownSetext.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownSetext.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSetext.swift"),
  "utf8",
);
const listSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
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
  "v1.80 CommonMark setext heading edge cases in completed assistant replies";

function headings(text: string): SetextBlock[] {
  return splitSetextHeadings(text, true);
}

function headingText(text: string): string | null {
  const block = headings(text).find((part) => part.type === "heading");
  return block?.type === "heading" ? block.text : null;
}

test("a multi-line paragraph and an underline are one heading", () => {
  assert.equal(headingText("Foo\nBar\n---\n"), "Foo\nBar");
  assert.equal(headingText("Foo *bar\nbaz*\n====\n"), "Foo *bar\nbaz*");
  const level = headings("Foo\nBar\n---\n");
  assert.equal(level[0]?.type, "heading");
  if (level[0]?.type === "heading") assert.equal(level[0].level, 2);
  const equals = headings("Foo\nBar\n===\n");
  assert.equal(equals[0]?.type, "heading");
  if (equals[0]?.type === "heading") assert.equal(equals[0].level, 1);
});

test("underline indent and trailing space follow cmark-gfm", () => {
  assert.equal(headingText("   Foo\n---\n"), "Foo");
  assert.equal(headingText("  Foo\n-----\n"), "Foo");
  assert.equal(headingText("  Foo\n  ===\n"), "Foo");
  assert.equal(headingText("Foo\n   ----      \n"), "Foo");
  assert.equal(headingText("Foo\n===\t\n"), "Foo");
  assert.equal(headingText("Foo\n    ---\n"), null);
  assert.equal(headingText("Foo\n    ===\n"), null);
  assert.equal(headingText("Foo\n\t===\n"), null);
  const wide = headings("Foo\n    ---\n");
  assert.equal(wide[0]?.type, "markdown");
  if (wide[0]?.type === "markdown") {
    const html = renderToStaticMarkup(
      React.createElement(Markdown, { children: wide[0].text }),
    );
    assert.match(html, /<p>Foo/);
    assert.match(html, /---/);
    assert.doesNotMatch(html, /<h2/);
  }
});

test("a dash underline is an h2 only when a paragraph is open", () => {
  assert.equal(headingText("Foo\n---\n"), "Foo");
  const ruled = headings("---\nFoo\n---\nBar\n---\nBaz\n");
  assert.deepEqual(
    ruled.map((part) => (part.type === "heading" ? `h${part.level}:${part.text}` : "md")),
    ["md", "h2:Foo", "h2:Bar", "md"],
  );
  const first = ruled[0];
  assert.equal(first?.type, "markdown");
  if (first?.type === "markdown") {
    const rules = splitThematicBreaks(first.text, true);
    assert.deepEqual(rules, [{ type: "rule" }]);
  }
  const pair = headings("---\n---\n");
  assert.equal(pair.some((part) => part.type === "heading"), false);
  if (pair[0]?.type === "markdown") {
    assert.deepEqual(splitThematicBreaks(pair[0].text, true), [
      { type: "rule" },
      { type: "rule" },
    ]);
  }
  assert.equal(headings("===\n").some((part) => part.type === "heading"), false);
  assert.equal(headings("\n====\n").some((part) => part.type === "heading"), false);
});

test("internal spaces are not an underline", () => {
  assert.equal(headingText("Foo\n= =\n"), null);
  assert.equal(headingText("Foo\n--- -\n"), null);
  const spaced = headings("Foo\n--- -\n");
  assert.equal(spaced[0]?.type, "markdown");
  if (spaced[0]?.type === "markdown") {
    const rules = splitThematicBreaks(spaced[0].text, true);
    assert.equal(rules.some((part) => part.type === "rule"), true);
    assert.equal(rules.some((part) => part.type === "markdown"), true);
  }
});

test("a lazy list or quote continuation is not a heading", () => {
  const quote = "> foo\nbar\n===\n";
  const protectedQuote = protectLazySetext(quote, true);
  assert.match(protectedQuote, /\\===/);
  assert.equal(headings(quote).some((part) => part.type === "heading"), false);

  const item = "- Foo\n===\n";
  assert.match(protectLazySetext(item, true), /\\===/);
  assert.equal(headings(item).some((part) => part.type === "heading"), false);

  const continued = "- Foo\n  bar\n===\n";
  assert.match(protectLazySetext(continued, true), /\\===/);
  assert.equal(headings(continued).some((part) => part.type === "heading"), false);

  assert.equal(headings("- Foo\n---\n").some((part) => part.type === "heading"), false);
  assert.equal(
    headings("- Foo\n  ---\n").some((part) => part.type === "heading"),
    false,
  );
  assert.equal(protectLazySetext("- Foo\n  ---\n", true).includes("\\---"), false);
  assert.equal(protectLazySetext("> foo\nbar\n---\n", true).includes("\\---"), false);
});

test("html blocks and indented code do not steal the underline", () => {
  assert.equal(headingText("<a title=\"a lot\n---\nof dashes\"/>\n"), "<a title=\"a lot");
  assert.equal(headingText("`Foo\n----\n`\n"), "`Foo");
  assert.equal(headingText("Foo\n<div>\n---\n"), null);
  assert.equal(headingText("<script>\n---\n</script>\nFoo\n===\n"), "Foo");
  assert.equal(headingText("<!--\n---\n-->\nFoo\n===\n"), "Foo");
  assert.equal(headingText("<br>\n---\n"), null);
  assert.equal(headingText("Foo\n<br/>\n---\n"), "Foo\n<br/>");

  const afterHeading = headings("# Heading\n    foo\nHeading\n------\n    foo\n----\n");
  assert.equal(afterHeading.filter((part) => part.type === "heading").length, 1);
  const heading = afterHeading.find((part) => part.type === "heading");
  assert.equal(heading?.type === "heading" ? heading.text : "", "Heading");
  const code = afterHeading.filter((part) => part.type === "markdown");
  assert.equal(code.length, 2);
  if (code[1]?.type === "markdown") {
    const rules = splitThematicBreaks(code[1].text, true);
    assert.equal(rules.at(-1)?.type, "rule");
  }
});

test("a link definition is not the paragraph above an underline", () => {
  const literal = resolveReferenceLinks("[foo]: /url\n===\n[foo]\n", true);
  assert.match(literal, /===/);
  assert.equal(headings(literal).some((part) => part.type === "heading"), false);

  const titled = resolveReferenceLinks("[foo]: /url\nbar\n===\n[foo]\n", true);
  assert.equal(headingText(titled), "bar");
  assert.match(titled, /\/url/);
});

test("streaming stays plain and the cut stays clients-only", () => {
  const live = "---\nFoo\n---\n";
  assert.equal(protectLazySetext(live, false), live);
  assert.deepEqual(splitSetextHeadings(live, false), [{ type: "markdown", text: live }]);
  assert.match(src, /v1\.80/);
  assert.match(swift, /v1\.80/);
  assert.match(src, /htmlBlockEnd/);
  assert.match(swift, /htmlBlockLineEnd/);
  assert.match(listSwift, /htmlBlockLineEnd/);
  assert.match(src, /allowCode/);
  assert.match(swift, /allowCode/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.80 /);
  assert.match(spec, /## 180\. v1\.80/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_setext_edge\.py/);
  assert.match(pkg, /markdownSetextEdge\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
