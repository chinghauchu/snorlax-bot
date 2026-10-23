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
import { restoreMarkdownEscapes, protectMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { linkTitleHint } from "./markdownLinkTitle.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const htmlSrc = readFileSync(join(here, "markdownHtmlLiteral.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEscape.swift"),
  "utf8",
);
const htmlSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownHtmlLiteral.swift"),
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
  "v1.61 CommonMark character references stay characters inside raw HTML in completed assistant replies";

function pipeline(text: string, completed = true): string {
  return promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(text, completed), completed),
      completed,
    ),
    completed,
  );
}

function markup(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: pipeline(text, true),
    }),
  );
}

/** Tokens in the rendered markup painted back to characters. */
function painted(text: string): string {
  return restoreMarkdownEscapes(markup(text));
}

function hrefOf(html: string): string {
  return /href="([^"]*)"/.exec(html)?.[1] ?? "";
}

function titleOf(html: string): string {
  return /title="([^"]*)"/.exec(html)?.[1] ?? "";
}

test("named and numeric references decode, and invalid ones stay literal", () => {
  assert.equal(
    restoreMarkdownEscapes(pipeline("&amp; &lt; &gt; &copy; &hellip;")),
    "& < > © …",
  );
  assert.equal(restoreMarkdownEscapes(pipeline("&nbsp;")), "\u00A0");
  assert.equal(restoreMarkdownEscapes(pipeline("&#35;")), "#");
  assert.equal(restoreMarkdownEscapes(pipeline("&#x1F600;")), "😀");
  assert.equal(restoreMarkdownEscapes(pipeline("&#X22;")), '"');
  assert.equal(protectMarkdownEscapes("&foo;", true), "&foo;");
  assert.equal(
    restoreMarkdownEscapes(protectMarkdownEscapes("&#87654321;", true)),
    "&#87654321;",
  );
  assert.match(protectMarkdownEscapes("&#87654321;", true), /§§SBE/);
  assert.equal(protectMarkdownEscapes("bare & here", true), "bare & here");
  assert.equal(protectMarkdownEscapes("&amp", true), "&amp");
  assert.equal(restoreMarkdownEscapes(pipeline("&#0;")), "\uFFFD");
  assert.equal(restoreMarkdownEscapes(pipeline("&#x0;")), "\uFFFD");
  assert.equal(
    painted("AT&amp;T &copy; &nbsp;&hellip;"),
    "<p>AT&T © \u00A0…</p>",
  );
});

test("a reference is not markdown syntax, and code stays literal", () => {
  const stars = markup("&#42;foo&#42;");
  assert.doesNotMatch(stars, /<em>/);
  assert.match(painted("&#42;foo&#42;"), /<p>\*foo\*<\/p>/);
  const head = markup("&#35; x");
  assert.doesNotMatch(head, /<h1>/);
  assert.match(painted("&#35; x"), /<p># x<\/p>/);
  const real = painted("# real\n\n&#35; not");
  assert.match(real, /<h1>real<\/h1>/);
  assert.match(real, /<p># not<\/p>/);
  const emphasisRaw = markup("*&#42;* and *yes*");
  assert.match(emphasisRaw, /<em>/);
  assert.match(painted("*&#42;* and *yes*"), /<em>\*<\/em>/);
  assert.match(painted("*&#42;* and *yes*"), /<em>yes<\/em>/);
  assert.equal(pipeline("`&amp;` `&#42;`"), "`&amp;` `&#42;`");
  const span = painted("`&amp;` and `&#35;`");
  assert.match(span, /<code>&amp;amp;<\/code>/);
  assert.match(span, /<code>&amp;#35;<\/code>/);
  assert.doesNotMatch(span, /SBE/);
  const fence = "```\n&amp; &#42; &#35;\n```";
  assert.equal(pipeline(fence), fence);
  const fenceHtml = painted(fence);
  assert.match(fenceHtml, /&amp;amp;/);
  assert.match(fenceHtml, /&amp;#42;/);
  assert.doesNotMatch(fenceHtml, /SBE/);
  assert.match(painted("**bold**"), /<strong>bold<\/strong>/);
});

test("a reference inside a raw HTML stash decodes and does not leak the token", () => {
  const tag = '<a href="?x=1&amp;y=2">hi</a>';
  assert.equal(
    restoreMarkdownEscapes(pipeline(tag)),
    '<a href="?x=1&y=2">hi</a>',
  );
  assert.doesNotMatch(markup(tag), /<a /);
  assert.equal(painted(tag), '<p><a href="?x=1&y=2">hi</a></p>');
  assert.equal(painted("foo <!-- &amp; --> bar"), "<p>foo <!-- & --> bar</p>");
  assert.equal(painted('say <br class="&amp;"> now'), '<p>say <br class="&"> now</p>');
  const hash = '<span title="&#35;">x</span>';
  assert.doesNotMatch(markup(hash), /<h1>/);
  assert.doesNotMatch(markup(hash), /<span/);
  assert.equal(painted(hash), '<p><span title="#">x</span></p>');
  const kbd = painted('<kbd title="&copy;">&amp;</kbd>');
  assert.doesNotMatch(kbd, /SBE/);
  assert.match(kbd, /<kbd title="©">&/);
  const block = painted('<div title="&amp;">\nx');
  assert.doesNotMatch(block, /SBE/);
  assert.match(block, /title=&quot;&/);
});

test("link destinations and titles decode character references", () => {
  const relative = '[a](/u?x=1&amp;y=2 "t&amp;t")';
  const relativeHtml = markup(relative);
  assert.equal(hrefOf(relativeHtml), "/u?x=1&amp;y=2");
  assert.equal(linkTitleHint(titleOf(relativeHtml)), "t&t");
  assert.match(relativeHtml, />a</);
  assert.doesNotMatch(painted(relative), /SBE/);
  const absolute = '[a](https://example.com/u?x=1&amp;y=2 "A &amp; B")';
  const absoluteHtml = markup(absolute);
  assert.equal(
    hrefOf(absoluteHtml),
    "https://example.com/u?x=1&amp;y=2",
  );
  assert.equal(linkTitleHint(titleOf(absoluteHtml)), "A & B");
  assert.doesNotMatch(painted(absolute), /SBE/);
  const quotes = '[a](https://example.com "say &#X22;hi&#X22;")';
  assert.equal(linkTitleHint(titleOf(markup(quotes))), 'say "hi"');
  assert.match(markup(quotes), /href="https:\/\/example.com"/);
});

test("streaming stays plain and copy keeps markdown source", () => {
  const streaming = '<a href="?x=1&amp;y=2">&#42;foo&#42;';
  assert.equal(pipeline(streaming, false), streaming);
  assert.equal(protectMarkdownEscapes("&amp; &#35;", false), "&amp; &#35;");
  assert.match(src, /for \(let pass = 0; pass < 8; pass \+= 1\)/);
  assert.match(src, /v1\.61/);
  assert.match(htmlSrc, /v1\.61/);
  assert.match(swift, /for _ in 0\.\.<8/);
  assert.match(swift, /v1\.61/);
  assert.match(htmlSwift, /v1\.61/);
  assert.match(markdown, /MarkdownEscape\.protect\(src, completed: completed\)/);
  assert.match(markdown, /MarkdownHtmlLiteral\.literalize\(/);
  assert.match(markdown, /MarkdownEscape\.restore\(parsed\)/);
  const literalAt = markdown.indexOf("MarkdownHtmlLiteral.literalize(");
  const protectAt = markdown.indexOf("MarkdownEscape.protect(src, completed: completed)");
  const restoreAt = markdown.indexOf("MarkdownEscape.restore(parsed)");
  // literalize(protect(...)) is written outer-first. Protect runs first.
  assert.ok(literalAt >= 0 && protectAt > literalAt && restoreAt > protectAt);
  assert.match(body, /restoreMarkdownEscapes\(href \?\? ""\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectMarkdownEscapes\(reply\.content/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.61 /);
  assert.match(spec, /## 161\. v1\.61/);
  assert.match(spec, /character references stay characters inside raw HTML/);
  assert.match(ci, /test_ios_markdown_entity\.py/);
  assert.match(pkg, /markdownEntity\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
