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
import { protectSymbolFlanks, symbolFlankAnimates } from "./markdownSymbol.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownSymbol.ts"), "utf8");
const escapeSrc = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSymbol.swift"),
  "utf8",
);
const escapeSwift = readFileSync(
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
  "v1.68 CommonMark Unicode symbols count as emphasis punctuation in completed assistant replies";

function render(source: string, completed = true): string {
  const prepared = protectMarkdownEscapes(source, completed);
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkStrikethrough],
      children: prepared,
    }),
  );
  return restoreMarkdownEscapes(html);
}

test("a symbol tight against asterisks stays literal on both parsers", () => {
  for (const sample of ["*£*bravo", "alpha*£*", "**£**bravo", "***£***bravo", "*±*1", "*™*brand", "a*©*b"]) {
    const stashed = protectSymbolFlanks(sample);
    assert.notEqual(stashed, sample);
    assert.match(stashed, /§§SBE[0-9A-F]{6}§§/);
    assert.equal(stashed.includes("£") || stashed.includes("±") || stashed.includes("™") || stashed.includes("©"), false);
    assert.equal(restoreMarkdownEscapes(stashed), sample);
    const html = render(sample);
    assert.doesNotMatch(html, /§§SBE/);
    assert.doesNotMatch(html, /<em>|<strong>/);
    assert.match(html, /£|±|™|©/);
  }
  assert.equal(render("see *£*bravo today"), "<p>see *£*bravo today</p>");
  assert.equal(render("*£ ¥*x"), "<p>*£ ¥*x</p>");
  assert.equal(render("**real** and *™*brand"), "<p><strong>real</strong> and *™*brand</p>");
  assert.equal(render("a*©*b*c*"), "<p>a*©<em>b</em>c*</p>");
  assert.equal(render("*±*1 and *2*"), "<p>*±*1 and <em>2</em></p>");
});

test("symbols that are real emphasis, and emoji, still render", () => {
  assert.match(render("*£50*"), /<em>£50<\/em>/);
  assert.match(render("price *£50* today"), /<em>£50<\/em>/);
  assert.match(render("(*©*)"), /<em>©<\/em>/);
  assert.match(render("**©** notice"), /<strong>©<\/strong>/);
  assert.match(render("*°C*"), /<em>°C<\/em>/);
  assert.match(render("*° C*"), /<em>° C<\/em>/);
  assert.match(render("*foo*"), /<em>foo<\/em>/);
  assert.match(render("foo*bar*baz"), /foo<em>bar<\/em>baz/);
  assert.match(render("***bold italic***"), /<strong>bold italic<\/strong>/);
  assert.match(render("*😀*bravo"), /<em>😀<\/em>bravo/);
  assert.equal(protectSymbolFlanks("*😀*bravo"), "*😀*bravo");
  assert.match(render("~~£~~"), /<del[^>]*>£<\/del>/);
  assert.equal(protectSymbolFlanks("~~gone~~"), "~~gone~~");
  assert.equal(protectSymbolFlanks("| a | b |"), "| a | b |");
  assert.equal(protectSymbolFlanks("`$` and ^ and +"), "`$` and ^ and +");
  assert.equal(protectSymbolFlanks("user£@example.com"), "user£@example.com");
  assert.match(protectSymbolFlanks("~~£~~"), /~§§SBE0000A3§§~/);
  assert.match(render("use __init__ and *£*1"), /__init__/);
  assert.doesNotMatch(render("use __init__ and *£*1"), /<em>|<strong>init<\/strong>/);
});

test("code, links, urls, and streaming stay source", () => {
  const fence = "```\n*£*bravo\n```";
  assert.equal(protectSymbolFlanks(fence), fence);
  assert.equal(protectMarkdownEscapes(fence), fence);
  assert.match(render(fence), /<code>\*£\*bravo\n<\/code>/);

  const inline = "see `*£*bravo` now";
  assert.equal(protectSymbolFlanks(inline), inline);
  assert.match(render(inline), /<code>\*£\*bravo<\/code>/);

  const indented = "\n    *£*bravo\n";
  assert.equal(protectSymbolFlanks(indented), indented);

  const url = "https://example.com/£50";
  assert.equal(protectSymbolFlanks(url), url);
  const www = "www.example.com/£";
  assert.equal(protectSymbolFlanks(www), www);
  const dest = "[docs](https://example.com/£)";
  assert.equal(protectSymbolFlanks(dest), dest);
  const label = "[*£*bravo](https://example.com/a)";
  assert.match(protectSymbolFlanks(label), /§§SBE0000A3§§/);
  assert.match(render(label), /href="https:\/\/example.com\/a"/);
  assert.doesNotMatch(render(label), /<em>/);

  assert.equal(protectSymbolFlanks("*£*bravo", false), "*£*bravo");
  assert.equal(protectMarkdownEscapes("*£*bravo", false), "*£*bravo");
  assert.equal(protectSymbolFlanks(protectSymbolFlanks("*£*bravo")), protectSymbolFlanks("*£*bravo"));
});

test("both platforms stash the symbol before the parser and copy stays source", () => {
  assert.match(src, /export function protectSymbolFlanks/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/MarkdownSymbol.swift`/);
  assert.match(swift, /static func protect\(_ text: String, completed: Bool\) -> String/);
  assert.match(swift, /Keep in lockstep with `desktop\/src\/markdownSymbol.ts`/);
  assert.match(swift, /case \.currencySymbol, \.modifierSymbol, \.mathSymbol, \.otherSymbol/);
  assert.match(swift, /scalar\.value <= 0x7F \|\| scalar\.value > 0xFFFF/);
  assert.match(src, /cp <= 0x7f/);
  assert.match(escapeSrc, /protectSymbolFlanks\(protectIntrawordUnderscores\(text, true\), true\)/);
  assert.match(escapeSwift, /MarkdownSymbol\.protect\(underscored, completed: true\)/);
  assert.match(markdown, /MarkdownEscape\.protect\(src, completed: completed\)/);
  assert.equal(body.split("protectMarkdownEscapes(mathText, completed)").length, 4);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectSymbolFlanks\(reply\.content/);
  assert.doesNotMatch(app, /protectMarkdownEscapes\(reply\.content/);
  assert.equal(symbolFlankAnimates(false), false);
  assert.equal(symbolFlankAnimates(true), false);
  assert.match(src, /markdown source/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v1.68 "));
  assert.match(spec, /## 168\. v1\.68/);
  assert.match(ci, /test_ios_markdown_symbol\.py/);
  assert.match(pkg, /markdownSymbol\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
