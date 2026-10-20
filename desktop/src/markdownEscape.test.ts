// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitWebUrls } from "./linkify.ts";
import { remarkStrikethrough, splitThematicBreaks } from "./markdownBreak.ts";
import {
  ASCII_PUNCT,
  decodeNumericReference,
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import { extractFootnotes } from "./markdownFootnote.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { splitMarkdownTables } from "./markdownTable.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEscape.swift"),
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
  "v1.40 CommonMark backslash escapes and HTML character references in completed assistant replies";

function render(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkStrikethrough],
      children: text,
    }),
  );
}

function visible(source: string): string {
  const html = render(protectMarkdownEscapes(source, true));
  return restoreMarkdownEscapes(html.replace(/<[^>]+>/g, ""));
}

test("ASCII punctuation escapes render as the character and not as syntax", () => {
  assert.equal(ASCII_PUNCT.length, 32);
  for (const ch of ASCII_PUNCT) {
    assert.equal(restoreMarkdownEscapes(protectMarkdownEscapes(`\\${ch}`, true)), ch);
  }
  const html = render(protectMarkdownEscapes("Use \\*not bold\\* and 5 \\> 3", true));
  assert.doesNotMatch(html, /<em>/);
  assert.doesNotMatch(html, /<strong>/);
  assert.doesNotMatch(html, /<blockquote>/);
  assert.equal(restoreMarkdownEscapes(html.replace(/<[^>]+>/g, "")), "Use *not bold* and 5 > 3");
  assert.equal(visible("\\# not a heading"), "# not a heading");
  assert.doesNotMatch(render(protectMarkdownEscapes("\\# not a heading", true)), /<h1>/);
  assert.equal(visible("\\- not a list"), "- not a list");
  assert.doesNotMatch(render(protectMarkdownEscapes("\\- not a list", true)), /<ul>/);
  assert.equal(visible("1\\. not ordered"), "1. not ordered");
  assert.doesNotMatch(render(protectMarkdownEscapes("1\\. not ordered", true)), /<ol>/);
  assert.equal(protectMarkdownEscapes("\\a stays", true), "\\a stays");
});

test("named and numeric references decode, and invalid ones stay safe", () => {
  assert.equal(visible("AT&amp;T"), "AT&T");
  assert.equal(visible("&lt;div&gt;"), "<div>");
  assert.equal(visible("&copy; 2026"), "© 2026");
  assert.equal(visible("&reg; &trade;"), "® ™");
  assert.equal(visible("&apos; &quot;"), "' \"");
  assert.equal(visible("&#8212;"), "—");
  assert.equal(visible("&#x1F600;"), "😀");
  assert.equal(visible("&#X1F600;"), "😀");
  assert.equal(visible("&nbsp;&hellip;"), "\u00A0…");
  assert.equal(visible("&check; &checkmark;"), "✓ ✓");
  assert.equal(visible("&larr;&rarr;&uarr;&darr;"), "←→↑↓");
  assert.equal(protectMarkdownEscapes("&notanentity;", true), "&notanentity;");
  assert.equal(protectMarkdownEscapes("&amp", true), "&amp");
  assert.equal(protectMarkdownEscapes("&#;", true), "&#;");
  assert.equal(protectMarkdownEscapes("&#x;", true), "&#x;");
  assert.equal(protectMarkdownEscapes("&#00000065;", true), "&#00000065;");
  assert.equal(restoreMarkdownEscapes(protectMarkdownEscapes("&#0;", true)), "\uFFFD");
  assert.equal(restoreMarkdownEscapes(protectMarkdownEscapes("&#x0;", true)), "\uFFFD");
  assert.equal(restoreMarkdownEscapes(protectMarkdownEscapes("&#xD800;", true)), "\uFFFD");
  assert.equal(restoreMarkdownEscapes(protectMarkdownEscapes("&#x110000;", true)), "\uFFFD");
  assert.equal(restoreMarkdownEscapes(protectMarkdownEscapes("&#x10FFFF;", true)), "\uFFFD");
  assert.equal(decodeNumericReference(0), "\uFFFD");
  assert.equal(decodeNumericReference(0x20), " ");
  assert.equal(decodeNumericReference(0x0c), "\u000c");
  const html = render(protectMarkdownEscapes("&lt;script&gt;alert(1)&lt;/script&gt;", true));
  assert.doesNotMatch(html, /<script/i);
  assert.equal(visible("&lt;script&gt;alert(1)&lt;/script&gt;"), "<script>alert(1)</script>");
});

test("code spans, fences, and indented code keep backslashes and entities", () => {
  const span = "`\\*` `&amp;`";
  assert.equal(protectMarkdownEscapes(span, true), span);
  const spanHtml = render(span);
  assert.match(spanHtml, /<code>\\\*<\/code>/);
  assert.match(spanHtml, /<code>&amp;amp;<\/code>/);
  const fence = "```js\n\\* &amp;\n```";
  assert.equal(protectMarkdownEscapes(fence, true), fence);
  const fenceHtml = render(fence);
  assert.match(fenceHtml, /\\\*/);
  assert.match(fenceHtml, /&amp;amp;/);
  const indented = "\n    \\* &amp;\n";
  assert.equal(protectMarkdownEscapes(indented, true), indented);
  const around = "before \\* `\\*` after \\*";
  const protectedAround = protectMarkdownEscapes(around, true);
  assert.match(protectedAround, /`\\\*`/);
  assert.equal(restoreMarkdownEscapes(protectedAround), "before * `\\*` after *");
});

test("math delimiters are taken before escapes, and hard breaks stay", () => {
  const extracted = extractMath("\\( \\alpha \\) and \\*x\\*");
  assert.equal(extracted.slots[0]?.tex.trim(), "\\alpha");
  const after = protectMarkdownEscapes(extracted.text, true);
  assert.match(after, /§§SBM/);
  assert.doesNotMatch(after, /\\\*/);
  assert.equal(restoreMarkdownEscapes(after).includes("*x*"), true);
  const block = extractMath("$$\n\\frac{1}{2}\n$$\n\\*n\\*");
  assert.match(block.slots[0]?.tex ?? "", /frac/);
  assert.equal(protectMarkdownEscapes(block.slots[0]?.raw ?? "", false), block.slots[0]?.raw);
  const hard = "line\\\nnext";
  assert.match(protectMarkdownEscapes(hard, true), /\\\n/);
  assert.match(render(protectMarkdownEscapes(hard, true)), /<br/);
  assert.match(render(protectMarkdownEscapes("two  \nnext", true)), /<br/);
});

test("escaped tildes are not strikethrough and escaped urls are not autolinks", () => {
  const escaped = render(protectMarkdownEscapes("\\~~not~~", true));
  assert.doesNotMatch(escaped, /<del/);
  assert.equal(visible("\\~~not~~"), "~~not~~");
  const struck = render(protectMarkdownEscapes("~~yes~~", true));
  assert.match(struck, /<del class="md-strike">yes<\/del>/);
  const linked = protectMarkdownEscapes("www.example.com and www\\.example.com", true);
  const pieces = splitWebUrls(linked).map((piece) => ({
    type: piece.type,
    value: restoreMarkdownEscapes(piece.value),
  }));
  assert.deepEqual(
    pieces.filter((piece) => piece.type === "link").map((piece) => piece.value),
    ["www.example.com"],
  );
  assert.equal(pieces.some((piece) => piece.type === "text" && piece.value.includes("www.example.com")), true);
  const escapedLink = render(protectMarkdownEscapes("\\<https://example.com>", true));
  assert.doesNotMatch(escapedLink, /<a /);
  assert.match(restoreMarkdownEscapes(escapedLink), /<https:\/\/example.com&gt;/);
  assert.match(render(protectMarkdownEscapes("<https://example.com>", true)), /href="https:\/\/example.com"/);
  const entityLink = render(
    protectMarkdownEscapes("[AT&amp;T](https://example.com?a=1&amp;b=2)", true),
  );
  const href = /href="([^"]+)"/.exec(entityLink)?.[1] ?? "";
  assert.equal(restoreMarkdownEscapes(href), "https://example.com?a=1&b=2");
  assert.equal(restoreMarkdownEscapes(entityLink.replace(/<[^>]+>/g, "")), "AT&T");
});

test("tables keep source and escaped pipes, and cells do not re-emphasize", () => {
  const source = ["| \\*no\\* | a \\| b |", "| --- | --- |", "| &lt;x&gt; | c |"].join("\n");
  const parts = splitMarkdownTables(source, true);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") return;
  assert.equal(parts[0].table.source, source);
  assert.deepEqual(parts[0].table.header, ["\\*no\\*", "a \\| b"]);
  const cell = render(protectMarkdownEscapes(parts[0].table.header[0] ?? "", true));
  assert.doesNotMatch(cell, /<em>/);
  assert.equal(restoreMarkdownEscapes(cell.replace(/<[^>]+>/g, "")), "*no*");
  const entity = visible(parts[0].table.rows[0]?.[0] ?? "");
  assert.equal(entity, "<x>");
  const breaks = splitThematicBreaks("\\---\n\n---\n\nafter", true);
  assert.equal(breaks.filter((block) => block.type === "rule").length, 1);
  const tasks = splitQuoteAndTasks("\\- [ ] no\n- [x] yes", true);
  assert.equal(tasks.some((block) => block.type === "tasks"), true);
  assert.equal(
    tasks.some((block) => block.type === "markdown" && block.text.startsWith("\\-")),
    true,
  );
});

test("footnotes and reference links still resolve, and streaming stays literal", () => {
  assert.equal(protectMarkdownEscapes("\\* &amp;", false), "\\* &amp;");
  const escaped = extractFootnotes("Literal\\[^1] here.\n\n[^1]: no", true);
  assert.equal(escaped.notes.length, 0);
  assert.match(visible(escaped.text), /\[\^1\]/);
  const noted = extractFootnotes("See [^1] and \\*x\\*.\n\n[^1]: &amp;", true);
  assert.equal(noted.notes.length, 1);
  const kept = protectMarkdownEscapes(noted.text, true);
  assert.match(kept, /§§SBFN1§§/);
  assert.match(restoreMarkdownEscapes(kept), /§§SBFN1§§/);
  assert.equal(visible(noted.notes[0]?.text ?? ""), "&");
  const linked = resolveReferenceLinks("See [ref] and \\*x\\*.\n\n[ref]: https://example.com/a", true);
  assert.match(linked, /\[ref\]\(https:\/\/example\.com\/a\)/);
  const shown = render(protectMarkdownEscapes(linked, true));
  assert.match(shown, /href="https:\/\/example.com\/a"/);
  assert.doesNotMatch(shown, /<em>/);
  const literal = resolveReferenceLinks("Literal \\[ref] here.\n\n[ref]: https://example.com/r\n", true);
  assert.match(visible(literal), /\[ref\]/);
});

test("real markdown still renders and copy stays on the raw message", () => {
  const html = render(protectMarkdownEscapes("**bold** and [docs](https://example.com)", true));
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(body, /protectMarkdownEscapes\(mathText, completed\)/);
  assert.match(body, /restoreMarkdownEscapes\(href \?\? ""\)/);
  assert.match(body, /restoreMarkdownEscapes\(typeof alt === "string" \? alt : ""\)/);
  assert.equal(body.split("protectMarkdownEscapes(mathText, completed)").length, 3);
  const mathAt = body.indexOf("extractMath(text)");
  const protectAt = body.indexOf("protectMarkdownEscapes(mathText, completed)");
  assert.ok(mathAt >= 0 && protectAt > mathAt);
  assert.match(markdown, /MarkdownEscape\.protect\(src, completed: completed\)/);
  assert.match(markdown, /MarkdownEscape\.restore\(parsed\)/);
  const inlineAt = markdown.indexOf("MarkdownSplit.splitInlineMath(source)");
  const protectCall = markdown.indexOf("MarkdownEscape.protect(src, completed: completed)");
  assert.ok(inlineAt >= 0 && protectCall > inlineAt);
  const linksAt = markdown.indexOf("WebLinks.applyingLinks(parsed, streaming: false)");
  const restoreAt = markdown.indexOf("MarkdownEscape.restore(parsed)");
  assert.ok(linksAt >= 0 && restoreAt > linksAt);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectMarkdownEscapes\(reply\.content/);
  assert.match(src, /markdown source/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.match(swift, /static func protect\(_ text: String, completed: Bool/);
  assert.match(swift, /if !completed \|\| text.isEmpty \{ return text \}/);
  assert.match(swift, /\\u\{FFFD\}/);
  for (const name of [
    "amp",
    "lt",
    "gt",
    "quot",
    "apos",
    "nbsp",
    "copy",
    "reg",
    "trade",
    "hellip",
    "mdash",
    "ndash",
    "lsquo",
    "rsquo",
    "ldquo",
    "rdquo",
    "times",
    "divide",
    "deg",
    "plusmn",
    "middot",
    "bull",
    "euro",
    "pound",
    "yen",
    "cent",
    "sect",
    "para",
    "larr",
    "rarr",
    "uarr",
    "darr",
    "check",
    "checkmark",
  ]) {
    assert.match(src, new RegExp(`"${name}":`));
    assert.match(swift, new RegExp(`"${name}":`));
  }
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.40 /);
  assert.match(spec, /## 140\. v1\.40/);
  assert.match(ci, /test_ios_markdown_escape\.py/);
  assert.match(pkg, /markdownEscape\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane/);
  assert.doesNotMatch(swift, /computerPane/);
});
