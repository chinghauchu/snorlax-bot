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
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import {
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEscape.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
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
  "v1.69 CommonMark over-long numeric character references stay literal in completed assistant replies";

function render(source: string, completed = true): string {
  const prepared = literalizeRawHtml(
    protectMarkdownEscapes(source, completed),
    completed,
  );
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: prepared,
    }),
  );
  return restoreMarkdownEscapes(html);
}

test("in-range references still decode", () => {
  assert.equal(render("&amp;"), "<p>&</p>");
  assert.equal(render("&copy;"), "<p>©</p>");
  assert.equal(render("&#169;"), "<p>©</p>");
  assert.equal(render("&#x1F600;"), "<p>😀</p>");
  assert.equal(render("&#X1F600;"), "<p>😀</p>");
  assert.equal(render("&#0000169;"), "<p>©</p>");
  assert.equal(render("&#x0000A9;"), "<p>©</p>");
  assert.equal(render("&#0;"), "<p>\uFFFD</p>");
  assert.equal(render("&#x10FFFF;"), "<p>\uFFFD</p>");
  assert.equal(protectMarkdownEscapes("&foo;", true), "&foo;");
  assert.equal(protectMarkdownEscapes("&amp", true), "&amp");
  assert.equal(protectMarkdownEscapes("bare & here", true), "bare & here");
});

test("too many digits stay the characters, not U+FFFD or an emoji", () => {
  for (const sample of [
    "&#87654321;",
    "&#12345678;",
    "&#x0001F600;",
    "&#X0001F600;",
    "&#x0000000;",
    "&#x1234567;",
  ]) {
    const stashed = protectMarkdownEscapes(sample, true);
    assert.notEqual(stashed, sample);
    assert.equal(stashed.includes("&"), false);
    assert.match(stashed, /§§SBE(?:[0-9A-F]{6})+§§/);
    assert.equal(restoreMarkdownEscapes(stashed), sample);
    const html = render(sample);
    assert.equal(html, `<p>${sample}</p>`);
    assert.doesNotMatch(html, /\uFFFD/);
    assert.doesNotMatch(html, /😀/);
    assert.doesNotMatch(html, /§§SBE/);
  }
  assert.equal(render("see &#87654321; now"), "<p>see &#87654321; now</p>");
  assert.equal(render("*&#87654321;*"), "<p><em>&#87654321;</em></p>");
  assert.doesNotMatch(render("&#x00000023; x"), /<h1>/);
  assert.equal(render("&#x00000023; x"), "<p>&#x00000023; x</p>");
});

test("a missing semicolon, code, and streaming stay source", () => {
  assert.equal(protectMarkdownEscapes("&#87654321", true), "&#87654321");
  assert.equal(protectMarkdownEscapes("&#x0001F600", true), "&#x0001F600");
  assert.equal(protectMarkdownEscapes("&#87654321x;", true), "&#87654321x;");
  const code = "`&#87654321;` and `&#x0001F600;`";
  assert.equal(protectMarkdownEscapes(code, true), code);
  assert.match(render(code), /<code>&amp;#87654321;<\/code>/);
  assert.match(render(code), /<code>&amp;#x0001F600;<\/code>/);
  const fence = "```\n&#87654321;\n&#x0001F600;\n```";
  assert.equal(protectMarkdownEscapes(fence, true), fence);
  assert.match(render(fence), /&amp;#87654321;/);
  assert.doesNotMatch(render(fence), /§§SBE/);
  assert.equal(protectMarkdownEscapes("&#87654321;", false), "&#87654321;");
  assert.equal(render("Use \\*not bold\\* &#169;", true), "<p>Use *not bold* ©</p>");
});

test("an over-long reference inside a tag or a link stays characters", () => {
  const tag = '<span title="&#87654321;">x</span>';
  const prepared = literalizeRawHtml(protectMarkdownEscapes(tag, true), true);
  const markup = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: prepared,
    }),
  );
  assert.doesNotMatch(markup, /<span/);
  const html = restoreMarkdownEscapes(markup);
  assert.equal(html, '<p><span title="&#87654321;">x</span></p>');
  assert.doesNotMatch(html, /§§SBE/);
  assert.doesNotMatch(html, /\uFFFD/);
  const link = render("[a](/q?&#87654321;)");
  assert.match(link, /href="\/q\?&amp;#87654321;"/);
  assert.doesNotMatch(link, /§§SBE/);
});

test("docs stay on OpenAPI 0.18.0 and both renderers share the rule", () => {
  assert.match(src, /v1\.69/);
  assert.match(src, /digits > max/);
  assert.match(swift, /v1\.69/);
  assert.match(swift, /digits > max/);
  assert.match(swift, /&#87654321;/);
  assert.match(swift, /&#x0001F600;/);
  assert.match(markdown, /MarkdownEscape\.protect\(src, completed: completed\)/);
  assert.equal(body.split("protectMarkdownEscapes(mathText, completed)").length, 4);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectMarkdownEscapes\(reply\.content/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(roadmap, /v1\.69 CommonMark over-long numeric character references stay literal/);
  assert.match(roadmap, /\/ v1\.69 /);
  assert.match(spec, /## 169\. v1\.69/);
  assert.match(spec, /&#87654321;/);
  assert.match(spec, /&#x0001F600;/);
  assert.match(ci, /test_ios_markdown_entity_digits\.py/);
  assert.match(pkg, /markdownEntityDigits\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.equal(PHRASE.includes("v1.69"), true);
});
