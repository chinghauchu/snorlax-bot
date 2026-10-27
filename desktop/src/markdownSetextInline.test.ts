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
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { splitIndentedCode } from "./markdownIndentedCode.ts";
import { headingInlineSource, splitSetextHeadings } from "./markdownSetext.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownSetext.ts"), "utf8");
const breaks = readFileSync(join(here, "markdownBreak.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSetext.swift"),
  "utf8",
);
const swiftBreak = readFileSync(
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
  "v1.93 cmark-gfm setext headings and thematic breaks in completed assistant replies";

type Piece =
  | { type: "heading"; level: 1 | 2; html: string }
  | { type: "rule" }
  | { type: "code"; source: string }
  | { type: "markdown"; html: string };

/** Same inline order a setext heading uses. Paragraph tags stay out. */
function paintInline(text: string): string {
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

function paintMarkdown(text: string): string {
  const source = applyHardLineBreaks(protectMarkdownEscapes(text, true), true);
  return restoreMarkdownEscapes(
    renderToStaticMarkup(
      React.createElement(Markdown, {
        remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
        children: source,
      }),
    ),
  );
}

/**
 * Setext, then thematic breaks, then indented code. The same order
 * `MarkdownBody` uses for a completed assistant reply.
 */
function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  for (const part of splitSetextHeadings(text, true)) {
    if (part.type === "heading") {
      out.push({ type: "heading", level: part.level, html: paintInline(part.text) });
      continue;
    }
    for (const br of splitThematicBreaks(part.text, true)) {
      if (br.type === "rule") {
        out.push({ type: "rule" });
        continue;
      }
      for (const code of splitIndentedCode(br.text, true)) {
        if (code.type === "code") {
          out.push({ type: "code", source: code.source });
          continue;
        }
        out.push({ type: "markdown", html: paintMarkdown(code.text) });
      }
    }
  }
  return out;
}

test("an indented dash or rule inside a setext heading stays text", () => {
  assert.deepEqual(pieces("Foo\n    -\n---\n"), [
    { type: "heading", level: 2, html: "Foo\n-" },
  ]);
  assert.deepEqual(pieces("Foo\n    ***\n---\n"), [
    { type: "heading", level: 2, html: "Foo\n***" },
  ]);
  assert.deepEqual(pieces("Foo\n \t---\n---\n"), [
    { type: "heading", level: 2, html: "Foo\n---" },
  ]);
  assert.deepEqual(pieces("Foo\n\t***\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n***" },
  ]);
  assert.deepEqual(pieces("Foo\n  \t* * *\n---\n"), [
    { type: "heading", level: 2, html: "Foo\n* * *" },
  ]);
  assert.deepEqual(pieces("Foo\nbar\n    ***\n---\n"), [
    { type: "heading", level: 2, html: "Foo\nbar\n***" },
  ]);
  assert.deepEqual(pieces("Foo\n    =\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n=" },
  ]);
  assert.deepEqual(pieces("Foo\n    ==\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n==" },
  ]);
  assert.deepEqual(pieces("Foo\n    --\n---\n"), [
    { type: "heading", level: 2, html: "Foo\n--" },
  ]);
});

test("an indented block marker inside a setext heading stays text", () => {
  assert.deepEqual(pieces("Foo\n    # bar\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n# bar" },
  ]);
  assert.deepEqual(pieces("Foo\n \t> bar\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n> bar" },
  ]);
  assert.deepEqual(pieces("Foo\n    - item\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n- item" },
  ]);
  assert.deepEqual(pieces("Foo\n    + item\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n+ item" },
  ]);
  assert.deepEqual(pieces("Foo\n    1. item\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n1. item" },
  ]);
  assert.deepEqual(pieces("Foo\n    2. item\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n2. item" },
  ]);
  assert.deepEqual(pieces("Foo\n    01. item\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n01. item" },
  ]);
  assert.deepEqual(pieces("Foo\n    ```\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n```" },
  ]);
  assert.deepEqual(pieces("Foo\n    ~~~\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n~~~" },
  ]);
  assert.deepEqual(pieces("Foo\n    ````\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n````" },
  ]);
  const emph = pieces("Foo\n    *bar*\n---\n");
  assert.equal(emph.length, 1);
  assert.equal(emph[0]?.type, "heading");
  if (emph[0]?.type === "heading") {
    assert.equal(emph[0].level, 2);
    assert.match(emph[0].html, /^Foo\n<em>bar<\/em>$/);
  }
  const strong = pieces("Foo\n***bar***\n===\n");
  assert.equal(strong[0]?.type, "heading");
  if (strong[0]?.type === "heading") {
    assert.match(strong[0].html, /Foo\n<em><strong>bar<\/strong><\/em>/);
  }
});

test("a newline inside a heading code span is a space, not a rule", () => {
  assert.deepEqual(pieces("Foo `a\n    ***\nb`\n===\n"), [
    { type: "heading", level: 1, html: "Foo <code>a *** b</code>" },
  ]);
  assert.deepEqual(pieces("Foo\n    ```\nbar\n    ```\n===\n"), [
    { type: "heading", level: 1, html: "Foo\n<code>bar</code>" },
  ]);
  const hard = pieces("Foo  \n    ***\n===\n");
  assert.equal(hard.length, 1);
  assert.equal(hard[0]?.type, "heading");
  if (hard[0]?.type === "heading") {
    assert.match(hard[0].html, /Foo<br\/>\n\*\*\*/);
    assert.doesNotMatch(hard[0].html, /<hr/);
  }
});

test("a tab stop of four columns is indented code when no paragraph is open", () => {
  assert.deepEqual(pieces("# Hi\n \t---\n---\n"), [
    { type: "markdown", html: "<h1>Hi</h1>" },
    { type: "code", source: "---" },
    { type: "rule" },
  ]);
  assert.deepEqual(pieces("# Hi\n  \t---\n---\n"), [
    { type: "markdown", html: "<h1>Hi</h1>" },
    { type: "code", source: "---" },
    { type: "rule" },
  ]);
  assert.deepEqual(pieces("# Hi\n   \t---\n---\n"), [
    { type: "markdown", html: "<h1>Hi</h1>" },
    { type: "code", source: "---" },
    { type: "rule" },
  ]);
  assert.deepEqual(pieces("# Hi\n\t---\n---\n"), [
    { type: "markdown", html: "<h1>Hi</h1>" },
    { type: "code", source: "---" },
    { type: "rule" },
  ]);
  assert.deepEqual(pieces("    code\n \t---\n---\n"), [
    { type: "code", source: "code\n---" },
    { type: "rule" },
  ]);
});

test("a marker in the first three columns still interrupts, and the old edges stay", () => {
  const atx = pieces("Foo\n# bar\n===\n");
  assert.equal(atx.some((part) => part.type === "heading"), false);
  assert.match(atx.map((part) => (part.type === "markdown" ? part.html : "")).join(""), /<h1>bar<\/h1>/);

  const quote = pieces("Foo\n> bar\n===\n");
  assert.equal(quote.some((part) => part.type === "heading"), false);

  const item = pieces("Foo\n- item\n===\n");
  assert.equal(item.some((part) => part.type === "heading"), false);
  assert.match(paintMarkdown("- item\n===\n"), /<li>item\n===<\/li>/);

  assert.deepEqual(pieces("Foo\n***\n===\n"), [
    { type: "markdown", html: "<p>Foo</p>" },
    { type: "rule" },
    { type: "markdown", html: "<p>===</p>" },
  ]);
  assert.deepEqual(pieces("   ***\n"), [{ type: "rule" }]);
  assert.deepEqual(pieces("    ***\n"), [{ type: "code", source: "***" }]);
  assert.deepEqual(pieces("*\t*\t*\n"), [{ type: "rule" }]);
  assert.deepEqual(pieces("Foo\n---\nbar\n"), [
    { type: "heading", level: 2, html: "Foo" },
    { type: "markdown", html: "<p>bar</p>" },
  ]);
  assert.deepEqual(pieces("Foo\n    ---\nbar\n"), [
    { type: "markdown", html: "<p>Foo\n---\nbar</p>" },
  ]);
});

test("docs, CI, and OpenAPI stay on this cut", () => {
  assert.match(src, /v1\.93/);
  assert.match(src, /contentColumns/);
  assert.match(src, /escapeHeadingBlockLines/);
  assert.match(breaks, /v1\.93/);
  assert.match(breaks, /contentColumns\(line\)/);
  assert.match(swift, /v1\.93/);
  assert.match(swift, /MarkdownIndentedCode.contentColumns/);
  assert.match(swift, /escapeHeadingBlockLines/);
  assert.match(swiftBreak, /v1\.93/);
  assert.match(swiftBreak, /MarkdownIndentedCode.contentColumns/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /\/v1\//);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.93 /);
  assert.match(spec, /## 193\. v1\.93/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_setext_inline\.py/);
  assert.match(pkg, /markdownSetextInline\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
