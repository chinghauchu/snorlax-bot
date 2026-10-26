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
import {
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { prepareImageAlts } from "./markdownImageAlt.ts";
import { prepareLinkDestinations } from "./markdownLinkDest.ts";
import { prepareLinkTitleForms } from "./markdownLinkTitle.ts";
import { fenceLanguage } from "./markdown.ts";
import { prepareSpacedLinkDestinations } from "./markdownReferenceLink.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const escapeSrc = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const markdownTs = readFileSync(join(here, "markdown.ts"), "utf8");
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
  "v1.90 cmark-gfm entity and numeric character references in completed assistant replies";

function render(source: string, completed = true): string {
  const prepared = prepareLinkTitleForms(
    prepareImageAlts(
      prepareSpacedLinkDestinations(
        prepareLinkDestinations(source, completed),
        completed,
      ),
      completed,
    ),
    completed,
  );
  const text = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(prepared, completed), completed),
      completed,
    ),
    completed,
  );
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      urlTransform: (url: string) => url,
      children: text,
    }),
  );
  return restoreMarkdownEscapes(html);
}

function titleOf(html: string): string {
  return /title="([^"]*)"/.exec(html)?.[1] ?? "";
}

function hrefOf(html: string): string {
  return /href="([^"]*)"/.exec(html)?.[1] ?? "";
}

test("named and numeric references already decode, and invalid ones stay literal", () => {
  assert.equal(
    render("&nbsp; &amp; &copy; &AElig; &Dcaron;"),
    "<p>\u00A0 & © Æ Ď</p>",
  );
  assert.equal(
    render("&frac34; &HilbertSpace; &DifferentialD;"),
    "<p>¾ ℋ ⅆ</p>",
  );
  assert.equal(render("&ClockwiseContourIntegral; &ngE;"), "<p>∲ ≧̸</p>");
  assert.equal(render("&CounterClockwiseContourIntegral;"), "<p>∳</p>");
  assert.equal(render("&#35; &#1234; &#992; &#0;"), "<p># Ӓ Ϡ \uFFFD</p>");
  assert.equal(render("&#X22; &#XD06; &#xcab;"), '<p>" ആ ಫ</p>');
  assert.equal(
    render("&nbsp &x; &#; &#x; &#87654321; &#abcdef0; &ThisIsNotDefined; &hi?;"),
    "<p>&amp;nbsp &amp;x; &amp;#; &amp;#x; &#87654321; &amp;#abcdef0; &amp;ThisIsNotDefined; &amp;hi?;</p>",
  );
  assert.equal(render("&copy"), "<p>&amp;copy</p>");
  assert.equal(render("&#x110000;"), "<p>\uFFFD</p>");
  assert.equal(render("&#xD800;"), "<p>\uFFFD</p>");
});

test("a reference is not markdown syntax, and code stays literal", () => {
  assert.equal(render("&#42;foo&#42;"), "<p>*foo*</p>");
  assert.doesNotMatch(render("&#42;foo&#42;"), /<em>/);
  assert.equal(render("&#42; foo\n\n* foo"), "<p>* foo</p>\n<ul>\n<li>foo</li>\n</ul>");
  assert.equal(render("foo&#10;&#10;bar"), "<p>foo\n\nbar</p>");
  assert.equal(render("&#9;foo"), "<p>\tfoo</p>");
  assert.doesNotMatch(render("&#9;foo"), /<pre>/);
  const literal = render('[a](url &quot;tit&quot;)');
  assert.equal(literal, '<p>[a](url "tit")</p>');
  assert.doesNotMatch(literal, /<a /);
  assert.equal(render("`&amp;` `&AElig;`"), "<p><code>&amp;amp;</code> <code>&amp;AElig;</code></p>");
  const fence = render("```\n&amp; &#42; &ouml;\n```");
  assert.match(fence, /&amp;amp;/);
  assert.match(fence, /&amp;#42;/);
  assert.match(fence, /&amp;ouml;/);
  assert.doesNotMatch(fence, /<p>/);
  const indented = render("    f&ouml;f&ouml;");
  assert.match(indented, /<pre><code>f&amp;ouml;f&amp;ouml;\n<\/code><\/pre>/);
});

test("titles and fence info strings decode the full HTML5 set", () => {
  const link = render('[foo](/f&ouml;&ouml; "f&ouml;&ouml;")');
  assert.equal(hrefOf(link), "/f%C3%B6%C3%B6");
  assert.equal(titleOf(link), "föö");
  const image = render('![alt](/f&ouml;&ouml; "f&AElig;")');
  assert.match(image, /src="\/f%C3%B6%C3%B6"/);
  assert.match(image, /title="fÆ"/);
  const ng = render('[a](https://example.com "&ngE;")');
  assert.equal(titleOf(ng), "≧̸");
  assert.equal(hrefOf(ng), "https://example.com");
  const defined = render('[foo]\n\n[foo]: /f&ouml;&ouml; "f&ouml;&ouml;"\n');
  assert.equal(hrefOf(defined), "/f%C3%B6%C3%B6");
  assert.equal(titleOf(defined), "föö");
  const info = render("``` f&ouml;&ouml;\n&amp;\n```");
  assert.match(info, /class="language-föö"/);
  assert.equal(fenceLanguage("language-föö"), "föö");
  assert.match(info, /&amp;amp;/);
  assert.doesNotMatch(info, /föö[\s\S]*föö/);
  assert.equal(fenceLanguage("language-foo&#87654321;"), "foo&#87654321;");
  assert.equal(fenceLanguage("language-js"), "js");
  assert.equal(fenceLanguage("language-C++"), "C++");
  assert.equal(fenceLanguage("language-foo+bar"), "foo+bar");
  assert.equal(fenceLanguage("language-mermaid"), "mermaid");
  const alt = render("![f&ouml;&ouml;](https://example.com/a.png)");
  assert.match(alt, /alt="föö"/);
});

test("streaming stays plain and the docs stay on OpenAPI 0.18.0", () => {
  assert.equal(protectMarkdownEscapes("&ouml; &#35;", false), "&ouml; &#35;");
  assert.equal(protectMarkdownEscapes("`&ouml;`", true), "`&ouml;`");
  assert.match(escapeSrc, /CMARK_NAMED_ENTITIES/);
  assert.match(escapeSrc, /v1\.90/);
  assert.match(markdownTs, /language-\(\\S\+\)/);
  assert.match(swift, /MarkdownCmarkEntities\.named/);
  assert.match(swift, /static func decodedText/);
  assert.match(markdown, /MarkdownEscape\.decodedText\(language\)/);
  assert.match(markdown, /completed \? MarkdownEscape\.decodedText\(language\) : language/);
  assert.match(body, /fenceLanguage\(props\.className\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectMarkdownEscapes\(reply\.content/);
  assert.doesNotMatch(escapeSrc, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.90 /);
  assert.match(spec, /## 190\. v1\.90/);
  assert.match(spec, /f&ouml;&ouml;/);
  assert.match(ci, /test_ios_markdown_entity_ref\.py/);
  assert.match(pkg, /markdownEntityRef\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
