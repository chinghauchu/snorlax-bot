// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownReferenceLink.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownReferenceLink.swift"),
  "utf8",
);
const app = readFileSync(join(here, "App.tsx"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE = "v1.76 CommonMark link text in completed assistant replies";

function render(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, { urlTransform: (url: string) => url, children: text }),
  );
}

function shown(text: string): string {
  return render(resolveReferenceLinks(text, true)).replace(/>\s+</g, "><");
}

test("balanced brackets are one link and unbalanced brackets fall back", () => {
  const balanced = shown("[link [foo [bar]]](/uri)");
  assert.match(balanced, /<a href="\/uri">link \[foo \[bar\]\]<\/a>/);
  assert.equal(shown("[link] bar](/uri)").includes("<a"), false);
  const inner = shown("[link [bar](/uri)");
  assert.match(inner, /\[link <a href="\/uri">bar<\/a>/);
  assert.doesNotMatch(inner, /<a[^>]*>link/);
  const escaped = shown("[link \\[bar](/uri)");
  assert.match(escaped, /<a href="\/uri">link \[bar<\/a>/);
});

test("a link may not contain another link, including a reference", () => {
  const inline = shown("[foo [bar](/u)](/v)");
  assert.match(inline, /\[foo <a href="\/u">bar<\/a>\]\(\/v\)/);
  assert.doesNotMatch(inline, /<a[^>]*>foo/);

  const nested = "[foo [bar](/uri)][ref]\n\n[ref]: /uri";
  assert.equal(
    resolveReferenceLinks(nested, true),
    "[foo [bar](/uri)][ref](/uri)\n\n",
  );
  const html = shown(nested);
  assert.match(html, /\[foo <a href="\/uri">bar<\/a>\]<a href="\/uri">ref<\/a>/);

  const emph = "[foo *bar [baz][ref]*][ref]\n\n[ref]: /uri";
  assert.equal(
    resolveReferenceLinks(emph, true),
    "[foo *bar [baz](/uri)*][ref](/uri)\n\n",
  );
  const emphHtml = shown(emph);
  assert.match(emphHtml, /\[foo <em>bar <a href="\/uri">baz<\/a><\/em>\]<a href="\/uri">ref<\/a>/);

  const balanced = "[link [foo [bar]]][ref]\n\n[ref]: /uri";
  assert.equal(
    resolveReferenceLinks(balanced, true),
    "[link [foo [bar]]](/uri)\n\n",
  );
  assert.match(shown(balanced), /<a href="\/uri">link \[foo \[bar\]\]<\/a>/);

  const both = "[outer [inner][ref]][outer]\n\n[ref]: /u\n[outer]: /v";
  assert.equal(
    resolveReferenceLinks(both, true),
    "[outer [inner](/u)][outer](/v)\n\n",
  );
  assert.match(shown(both), /\[outer <a href="\/u">inner<\/a>\]<a href="\/v">outer<\/a>/);
});

test("code spans and autolinks bind tighter than link brackets", () => {
  assert.equal(shown("[foo`](/uri)`").includes("<a"), false);
  assert.match(shown("[foo`](/uri)`"), /<code>\]\(\/uri\)<\/code>/);
  assert.equal(shown("[foo`]`(/uri)").includes("<a"), false);
  assert.match(shown("[foo`]`(/uri)"), /<code>\]<\/code>/);

  const coded = "[link `code`][ref]\n\n[ref]: /uri";
  assert.equal(resolveReferenceLinks(coded, true), "[link `code`](/uri)\n\n");
  assert.match(shown(coded), /<a href="\/uri">link <code>code<\/code><\/a>/);

  const inside = "[foo`][ref]`\n\n[ref]: /uri";
  const insideOut = resolveReferenceLinks(inside, true);
  assert.match(insideOut, /`]\[ref]`/);
  assert.equal(insideOut.includes("](/uri)"), false);

  const auto = "[foo<https://example.com/?search=](uri)>";
  assert.equal(resolveReferenceLinks(`${auto}\n\n[ref]: /uri`, true).includes("](/uri)"), false);
  const autoHtml = shown(auto);
  assert.match(autoHtml, /href="https:\/\/example\.com\/\?search=%5D\(uri\)"/);
  assert.doesNotMatch(autoHtml, /href="uri"/);

  const raw = '[foo <bar attr="][ref]">\n\n[ref]: /uri';
  const rawOut = resolveReferenceLinks(raw, true);
  assert.match(rawOut, /attr="\]\[ref\]"/);
  assert.equal(rawOut.includes("](/uri)"), false);
});

test("an undefined full label does not become a shortcut", () => {
  const onlyFoo = "[foo][bar]\n\n[foo]: /url1";
  const out = resolveReferenceLinks(onlyFoo, true);
  assert.match(out, /\[foo\]\[bar\]/);
  assert.equal(out.includes("/url1"), false);

  const chain = "[foo][bar][baz]\n\n[baz]: /url";
  assert.match(resolveReferenceLinks(chain, true), /^\[foo\]\[bar\]\(\/url\)/);

  const empty = "[foo]()\n\n[foo]: /url1";
  assert.match(resolveReferenceLinks(empty, true), /^\[foo\]\(\)/);
  assert.equal(resolveReferenceLinks(empty, true).includes("/url1"), false);

  const notLink = "[foo](not a link)\n\n[foo]: /url1";
  assert.match(resolveReferenceLinks(notLink, true), /^\[foo\]\(\/url1\)\(not a link\)/);
});

test("images may contain links, and a link may contain an image", () => {
  const image = "![foo [bar][ref]][img]\n\n[ref]: /u\n[img]: https://example.com/a.png";
  assert.equal(
    resolveReferenceLinks(image, true),
    "![foo [bar](/u)](https://example.com/a.png)\n\n",
  );
  assert.match(shown(image), /alt="foo bar"/);
  assert.match(shown(image), /src="https:\/\/example.com\/a.png"/);

  const wrapped = "[![moon][img]][ref]\n\n[img]: moon.jpg\n[ref]: /uri";
  assert.equal(
    resolveReferenceLinks(wrapped, true),
    "[![moon](moon.jpg)](/uri)\n\n",
  );
  assert.match(shown(wrapped), /<a href="\/uri"><img src="moon\.jpg" alt="moon"\/><\/a>/);
});

test("streaming stays plain and copy is still the source", () => {
  const live = "[foo [bar](/uri)][ref]\n\n[ref]: /uri";
  assert.equal(resolveReferenceLinks(live, false), live);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(app, /resolveReferenceLinks\(replyBody, completed\)/);
});

test("docs, CI, and OpenAPI record v1.76 without a new route", () => {
  assert.match(src, /v1\.76/);
  assert.match(src, /noLinkOpeners/);
  assert.match(src, /bracketAfter/);
  assert.match(swift, /v1\.76/);
  assert.match(swift, /noLinkOpeners/);
  assert.match(swift, /bracketAfter/);
  assert.match(swift, /func autolinkEnd/);
  assert.match(swift, /MarkdownHtmlLiteral\.htmlTagEnd/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.76 /);
  assert.match(spec, /## 176\. v1\.76/);
  assert.match(spec, /link text in completed assistant replies/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_link_text\.py/);
  assert.match(pkg, /markdownLinkText\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
