// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitThematicBreaks, thematicBreakMarker } from "./markdownBreak.ts";
import { splitMarkdownLists } from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { splitSetextHeadings } from "./markdownSetext.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownBreak.ts"), "utf8");
const swift = readFileSync(
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
  "v1.82 CommonMark thematic break edge cases in completed assistant replies";

function kinds(text: string): string[] {
  return splitThematicBreaks(text, true).map((part) => part.type);
}

function flat(html: string): string {
  return html.replace(/\s+/g, "").replace(/<hr\s*\/?>/gi, "<hr>");
}

function renderChunk(text: string): string {
  const parts = splitSetextHeadings(text, true).flatMap((part) => {
    if (part.type === "heading") return [{ type: "heading" as const, level: part.level, text: part.text }];
    return splitThematicBreaks(part.text, true);
  });
  return parts
    .map((part) => {
      if (part.type === "rule") return "<hr>";
      if (part.type === "heading") {
        const inner = renderToStaticMarkup(
          React.createElement(Markdown, { children: part.text }),
        ).replace(/^<p>/, "").replace(/<\/p>$/, "");
        return part.level === 1 ? `<h1>${inner}</h1>` : `<h2>${inner}</h2>`;
      }
      return renderToStaticMarkup(React.createElement(Markdown, { children: part.text }));
    })
    .join("");
}

test("the CommonMark thematic-break examples that already matched stay rules", () => {
  for (const line of ["***", "---", "___", "   ***", " - - -", "**  * ** * ** * **", "-     -      -", "*\t*\t*"]) {
    assert.equal(thematicBreakMarker(line) != null, true, line);
    assert.deepEqual(kinds(line), ["rule"]);
  }
  for (const line of ["--", "**", "__", "    ***", "*-*", "---a---", "+++", "===", "_ _ _ _ a"]) {
    assert.equal(thematicBreakMarker(line), null, line);
    assert.deepEqual(kinds(line), ["markdown"]);
  }
  assert.deepEqual(kinds("Foo\n***\nbar"), ["markdown", "rule", "markdown"]);
  assert.deepEqual(kinds("Foo\n    ***"), ["markdown"]);
  assert.deepEqual(kinds("* Foo\n* * *\n* Bar"), ["markdown", "rule", "markdown"]);
  assert.deepEqual(kinds("- foo\n***\n- bar"), ["markdown", "rule", "markdown"]);
  const setext = splitSetextHeadings("Foo\n---\nbar", true);
  assert.equal(setext[0]?.type, "heading");
  if (setext[0]?.type === "heading") assert.equal(setext[0].level, 2);
  assert.equal(kinds("Foo\n---\nbar").includes("rule"), false);
});

test("a break indented into a list item stays inside the item", () => {
  const tight = "- foo\n  ***\n  bar";
  assert.deepEqual(kinds(tight), ["markdown"]);
  const html = flat(renderChunk(tight));
  assert.equal(html, "<ul><li>foo<hr>bar</li></ul>");

  const spaced = "- foo\n  * * *\n  bar";
  assert.deepEqual(kinds(spaced), ["markdown"]);
  assert.equal(flat(renderChunk(spaced)), "<ul><li>foo<hr>bar</li></ul>");

  const dashes = "- foo\n  - - -\n  bar";
  assert.deepEqual(kinds(dashes), ["markdown"]);
  assert.equal(flat(renderChunk(dashes)), "<ul><li>foo<hr>bar</li></ul>");

  const loose = "- foo\n\n  ***\n\n  bar";
  assert.deepEqual(kinds(loose), ["markdown"]);
  assert.equal(flat(renderChunk(loose)), "<ul><li><p>foo</p><hr><p>bar</p></li></ul>");

  const lists = splitMarkdownLists(tight, true);
  assert.equal(lists[0]?.type, "list");
  if (lists[0]?.type === "list") {
    assert.equal(lists[0].list.items[0], "foo\n***\nbar");
    assert.deepEqual(kinds(lists[0].list.items[0] ?? ""), ["markdown", "rule", "markdown"]);
  }

  const sameLine = "- Foo\n- * * *";
  assert.deepEqual(kinds(sameLine), ["markdown"]);
  assert.equal(flat(renderChunk(sameLine)), "<ul><li>Foo</li><li><hr></li></ul>");

  const margin = flat(renderChunk("- foo\n***\n- bar"));
  assert.equal(margin, "<ul><li>foo</li></ul><hr><ul><li>bar</li></ul>");
});

test("a break-like line inside an HTML block is not a rule", () => {
  for (const block of [
    "<div>\n***\n</div>",
    "<div>\n* * *\n</div>",
    "<script>\n---\n</script>\nfoo",
    "<!--\n***\n-->",
    "<br>\n***\nbar",
    "foo\n\n<br>\n***\nbar",
  ]) {
    assert.equal(kinds(block).includes("rule"), false, block);
  }
  assert.deepEqual(kinds("foo\n<br>\n***\nbar"), ["markdown", "rule", "markdown"]);
  const fence = "```\n***\n```";
  assert.deepEqual(kinds(fence), ["markdown"]);
  const quote = splitQuoteAndTasks("> foo\n> ***\n> bar", true);
  assert.equal(quote[0]?.type, "quote");
  if (quote[0]?.type === "quote") {
    assert.deepEqual(kinds(quote[0].text), ["markdown", "rule", "markdown"]);
  }
  assert.deepEqual(splitThematicBreaks("- foo\n  ***\n  bar", false), [
    { type: "markdown", text: "- foo\n  ***\n  bar" },
  ]);
});

test("docs, CI, and OpenAPI stay on this cut", () => {
  assert.match(src, /v1\.82/);
  assert.match(src, /markdownListEnd/);
  assert.match(src, /htmlBlockEnd/);
  assert.match(swift, /v1\.82/);
  assert.match(swift, /MarkdownList\.listEnd/);
  assert.match(swift, /htmlBlockLineEnd/);
  assert.match(roadmap, /\/ v1\.82 /);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(spec, /## 182\. v1\.82/);
  assert.match(spec, /thematic break edge cases/i);
  assert.match(ci, /test_ios_markdown_thematic_edge\.py/);
  assert.match(pkg, /markdownThematicEdge\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.equal(src.includes("computerPane"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.equal(swift.includes("/v1/"), false);
});
