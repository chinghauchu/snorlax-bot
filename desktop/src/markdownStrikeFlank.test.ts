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
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const strikeSrc = readFileSync(join(here, "markdownBreak.ts"), "utf8");
const singleSrc = readFileSync(join(here, "markdownSingleStrike.ts"), "utf8");
const altSrc = readFileSync(join(here, "markdownImageAlt.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSingleStrike.swift"),
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

const PHRASE = "v1.84 GFM strikethrough flanking in completed assistant replies";

function render(text: string, completed = true): string {
  const source = completed
    ? promoteSingleTilde(
        applyHardLineBreaks(literalizeRawHtml(protectMarkdownEscapes(text, true), true), true),
        true,
      )
    : text;
  return restoreMarkdownEscapes(
    renderToStaticMarkup(
      React.createElement(Markdown, {
        remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
        children: source,
      }),
    ),
  );
}

function struck(html: string): string | null {
  const match = /<del class="md-strike">([\s\S]*?)<\/del>/.exec(html);
  return match ? match[1]! : null;
}

test("one or two tildes strike and three or more stay literal", () => {
  assert.equal(struck(render("~a~")), "a");
  assert.equal(struck(render("~~a~~")), "a");
  assert.equal(struck(render("~one~ ~~two~~")), "one");
  assert.match(render("~one~ ~~two~~"), /<del class="md-strike">two<\/del>/);
  const triple = render("x ~~~foo~~~ y");
  assert.doesNotMatch(triple, /<del/);
  assert.match(triple, /~~~foo~~~/);
  assert.equal(struck(render("~~a~~~b~~")), "a~~~b");
  assert.doesNotMatch(render("~~a~"), /<del/);
  assert.match(render("~~a~"), /~~a~/);
  assert.doesNotMatch(render("~a~~"), /<del/);
  assert.match(render("~a~~"), /~a~~/);
  assert.equal(struck(render("~foo~~bar~")), "foo~~bar");
  assert.doesNotMatch(render("No ~mismatch~~"), /<del/);
});

test("whitespace and punctuation flanking match cmark-gfm", () => {
  for (const sample of ["~~ a~~", "~~a ~~", "~~ foo ~~", "~~ a~~b", "a~~ b~~"]) {
    const html = render(sample);
    assert.doesNotMatch(html, /<del/, sample);
    assert.match(html, /~~/, sample);
  }
  for (const sample of ["a~~.b~~", "~~b.~~c", "a~~!~~", "a~~$~~b", "a~~+~~b", "a~~<~~b", "a~~…~~b", "a~~—~~b", "a~(b)~c", "~~(foo)~~bar", "foo~~bar.~~baz", "~~.~~b", "~~b)~~c"]) {
    assert.doesNotMatch(render(sample), /<del/, sample);
  }
  assert.equal(struck(render("~~!~~")), "!");
  assert.equal(struck(render("~~$~~")), "$");
  assert.equal(struck(render("~~.b~~")), ".b");
  assert.equal(struck(render("~~b.~~")), "b.");
  assert.equal(struck(render("(~~b~~)")), "b");
  assert.equal(struck(render("~~(foo)~~")), "(foo)");
  assert.equal(struck(render("a~~£~~b")), "£");
  assert.equal(struck(render("~~foo ~~bar~~")), "bar");
  assert.match(render("~~foo ~~bar~~"), /^<p>~~foo /);
  assert.equal(render("~~a ~~b~~ c~~"), '<p><del class="md-strike">a <del class="md-strike">b</del> c</del></p>');
  assert.equal(struck(render("~~is ~~legit~~")), "legit");
  const legit = render("This ~is ~ legit~ isn't ~ legit.");
  assert.match(legit, /<del class="md-strike">is ~ legit<\/del>/);
  assert.match(legit, /isn&#x27;t ~ legit/);
  assert.doesNotMatch(render("~a~~ b~"), /<del/);
});

test("intraword tildes strike and code wins over a pair", () => {
  assert.equal(struck(render("foo~~bar~~baz")), "bar");
  assert.equal(struck(render("foo~bar~baz")), "bar");
  assert.match(render("~~**bold**~~"), /<del class="md-strike"><strong>bold<\/strong><\/del>/);
  assert.match(render("**~~x~~**"), /<strong><del class="md-strike">x<\/del><\/strong>/);
  assert.match(render("~~*b*~~"), /<del class="md-strike"><em>b<\/em><\/del>/);
  assert.match(render("*~~foo~~*"), /<em><del class="md-strike">foo<\/del><\/em>/);
  const punctEm = render("a~~*b*~~c");
  assert.doesNotMatch(punctEm, /<del/);
  assert.match(punctEm, /a~~<em>b<\/em>~~c/);
  const code = render("say `~~nope~~` and ~~yes~~");
  assert.match(code, /<code>~~nope~~<\/code>/);
  assert.match(code, /<del class="md-strike">yes<\/del>/);
  assert.match(render("[~docs~](https://example.com)"), /<del class="md-strike">docs<\/del>/);
  const linkTail = render("~~[a](http://b/c)~~d");
  assert.doesNotMatch(linkTail, /<del/);
  assert.match(linkTail, /~~<a href="http:\/\/b\/c">a<\/a>~~d/);
  assert.match(render("~~[a](http://b)~~"), /<del class="md-strike"><a href="http:\/\/b">a<\/a><\/del>/);
});

test("escaped tildes stay literal and a soft break can sit inside", () => {
  assert.equal(render("\\~~not~~"), "<p>~~not~~</p>");
  assert.equal(render("\\~not~"), "<p>~not~</p>");
  assert.equal(struck(render("~~foo\\~bar~~")), "foo~bar");
  assert.match(render("~foo\nbar~"), /<del class="md-strike">foo[\s\S]*bar<\/del>/);
  assert.match(render("~~foo\nbar~~"), /<del class="md-strike">foo[\s\S]*bar<\/del>/);
  const spaces = render("~~foo  \nbar~~");
  assert.doesNotMatch(spaces, /<del/);
  assert.match(spaces, /~~foo<br\s*\/?>\s*bar~~/);
  const slash = render("~~foo\\\nbar~~");
  assert.doesNotMatch(slash, /<del/);
  assert.match(slash, /~~foo<br\s*\/?>\s*bar~~/);
  const url = render("see https://example.com/~~foo~~ now");
  assert.doesNotMatch(url, /<del/);
  assert.match(url, /https:\/\/example.com\/~~foo~~/);
});

test("streaming stays plain and copy keeps markdown source", () => {
  const raw = "a~~.b~~ ~~c~~";
  assert.equal(promoteSingleTilde(raw, false), raw);
  assert.equal(promoteSingleTilde(raw, true), raw);
  assert.doesNotMatch(render(raw, false), /<del/);
  assert.match(render(raw, false), /a~~\.b~~/);
  assert.equal(body.split("promoteSingleTilde(").length, 4);
  assert.match(body, /remarkPlugins=\{completed \? \[remarkHardBreaks, remarkStrikethrough\] : \[\]\}/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(singleSrc, /copyText/);
  assert.doesNotMatch(singleSrc, /clipboard/);
  assert.match(strikeSrc, /ASCII_PUNCT/);
  assert.match(strikeSrc, /end - i === 1 \|\| end - i === 2/);
  assert.match(swift, /v1\.84 retires/);
  assert.match(swift, /if !completed \|\| text.isEmpty \|\| !text.contains\("~"\)/);
  assert.doesNotMatch(swift, /shieldStrayTildes/);
  assert.match(altSrc, /if \(!strike \|\| n === 2\)/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.84 /);
  assert.match(spec, /## 184\. v1\.84/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_strike_flank\.py/);
  assert.match(pkg, /markdownStrikeFlank\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(strikeSrc, /\/v1\//);
});
