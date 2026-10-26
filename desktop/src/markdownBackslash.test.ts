// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { prepareAngleAutolinks } from "./markdownAutolink.ts";
import { remarkStrikethrough } from "./markdownBreak.ts";
import {
  ASCII_PUNCT,
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { prepareImageAlts } from "./markdownImageAlt.ts";
import { prepareLinkDestinations } from "./markdownLinkDest.ts";
import { prepareLinkTitleForms } from "./markdownLinkTitle.ts";
import { fenceLanguage } from "./markdown.ts";
import {
  prepareSpacedLinkDestinations,
  resolveReferenceLinks,
} from "./markdownReferenceLink.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const escapeSrc = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const refSrc = readFileSync(join(here, "markdownReferenceLink.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEscape.swift"),
  "utf8",
);
const refSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownReferenceLink.swift"),
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
  "v1.91 cmark-gfm backslash escapes in completed assistant replies";

function restoreTree(node: ReactNode): ReactNode {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") return restoreMarkdownEscapes(child);
    if (!React.isValidElement(child)) return child;
    const props = child.props as { children?: ReactNode };
    if (props.children == null) return child;
    return React.cloneElement(child, {}, restoreTree(props.children));
  });
}

function omitNode(tag: string) {
  return (props: Record<string, unknown>) => {
    const { children, node: _node, ...rest } = props;
    if (typeof rest.href === "string") rest.href = restoreMarkdownEscapes(rest.href);
    if (typeof rest.title === "string") rest.title = restoreMarkdownEscapes(rest.title);
    return React.createElement(tag, rest, restoreTree(children as ReactNode));
  };
}

const components = Object.fromEntries(
  ["p", "a", "em", "strong", "code", "pre", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "br"].map(
    (tag) => [tag, omitNode(tag)],
  ),
);

function render(source: string, completed = true): string {
  const linked = resolveReferenceLinks(source, completed);
  const prepared = prepareLinkTitleForms(
    prepareImageAlts(
      prepareSpacedLinkDestinations(prepareLinkDestinations(linked, completed), completed),
      completed,
    ),
    completed,
  );
  const extracted = extractMath(prepared);
  const mathText = prepareAngleAutolinks(extracted.text, completed);
  const text = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(mathText, completed), completed),
      completed,
    ),
    completed,
  );
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      urlTransform: (url: string) => url,
      components,
      children: text,
    }),
  );
}

function hrefOf(html: string): string {
  return /href="([^"]*)"/.exec(html)?.[1] ?? "";
}

function titleOf(html: string): string {
  return /title="([^"]*)"/.exec(html)?.[1] ?? "";
}

test("ordinary punctuation, literal backslashes, and hard breaks already match", () => {
  assert.equal(ASCII_PUNCT.length, 32);
  const punct = render(String.raw`\!\"\#\$\%\&\'\*\+\,\-\.\/\:\;\<\=\>\?\@\[\\\]\^\_\`\{\|\}\~`);
  assert.equal(punct, "<p>!&quot;#$%&amp;&#x27;*+,-./:;&lt;=&gt;?@[\\]^_`{|}~</p>");
  assert.equal(render("\\→\\A\\a\\ \\3\\φ\\«"), "<p>\\→\\A\\a\\ \\3\\φ\\«</p>");
  assert.equal(render("\\\\*emphasis*"), "<p>\\<em>emphasis</em></p>");
  assert.equal(render("foo\\\nbar"), "<p>foo<br/>\nbar</p>");
  assert.equal(render("foo\\\n"), "<p>foo\\</p>");
  assert.equal(render("foo\\"), "<p>foo\\</p>");
  assert.equal(render("foo\\\n\nbar"), "<p>foo\\</p>\n<p>bar</p>");
  assert.match(render("`\\*`"), /<code>\\\*<\/code>/);
  assert.match(render("```\n\\[\\]\n```"), /\\\[\\\]/);
  assert.match(render("\n    \\[\\]\n"), /\\\[\\\]/);
  assert.equal(render("> foo\\\n> bar"), "<blockquote>\n<p>foo<br/>\nbar</p>\n</blockquote>");
  assert.equal(render("> foo\\\nbar"), "<blockquote>\n<p>foo<br/>\nbar</p>\n</blockquote>");
  assert.equal(render("> foo\\"), "<blockquote>\n<p>foo\\</p>\n</blockquote>");
  assert.equal(render("- foo\\\n  bar"), "<ul>\n<li>foo<br/>\nbar</li>\n</ul>");
  assert.equal(render("- foo\\"), "<ul>\n<li>foo\\</li>\n</ul>");
  const dest = render("[foo](/bar\\* \"ti\\*tle\")");
  assert.equal(hrefOf(dest), "/bar*");
  assert.equal(titleOf(dest), "ti*tle");
  const defined = render("[foo]\n\n[foo]: /bar\\* \"ti\\*tle\"\n");
  assert.equal(hrefOf(defined), "/bar*");
  assert.equal(titleOf(defined), "ti*tle");
  const both = render('[foo]: /url\\bar\\*baz "foo\\"bar\\baz"\n\n[foo]\n');
  assert.equal(hrefOf(both), "/url%5Cbar*baz");
  assert.equal(titleOf(both), "foo&quot;bar\\baz");
  const info = render("``` foo\\+bar\nfoo\n```\n");
  assert.match(info, /class="language-foo\+bar"/);
  assert.equal(fenceLanguage("language-foo+bar"), "foo+bar");
  const plain = render("``` foo\\bar\nfoo\n```\n");
  assert.match(plain, /class="language-foo\\bar"/);
});

test("a backslash and an entity inside an autolink stay literal", () => {
  const url = render("<http://example.com?find=\\*>");
  assert.equal(
    url,
    '<p><a href="http://example.com?find=%5C*">http://example.com?find=\\*</a></p>',
  );
  const entity = render("<http://example.com?a=&amp;b>");
  assert.equal(
    entity,
    '<p><a href="http://example.com?a=&amp;amp;b">http://example.com?a=&amp;amp;b</a></p>',
  );
  assert.equal(render("\\<http://example.com>"), "<p>&lt;http://example.com&gt;</p>");
  assert.equal(render("<user\\@example.com>"), "<p>&lt;user@example.com&gt;</p>");
  assert.match(render("<user@example.com>"), /href="mailto:user@example.com"/);
});

test("a backslash inside raw HTML stays, and a character reference still decodes", () => {
  assert.equal(
    render('foo <a href="\\*">'),
    '<p>foo &lt;a href=&quot;\\*&quot;&gt;</p>',
  );
  assert.equal(
    render('<a href="/bar\\/)">'),
    '<p>&lt;a href=&quot;/bar\\/)&quot;&gt;</p>',
  );
  assert.equal(render("<div>\nfoo\\*\n</div>\n"), "&lt;div&gt;\nfoo\\*\n&lt;/div&gt;");
  const named = render('foo <a href="&ouml;">');
  assert.match(named, /foo &lt;a href=&quot;ö&quot;&gt;/);
  assert.doesNotMatch(named, /<a href/);
  assert.equal(render("\\<br/> not a tag"), "<p>&lt;br/&gt; not a tag</p>");
  assert.match(render("use <br> here"), /use <br\/>\s*here|use <br>\s*here/);
});

test("a reference label keeps a backslash when it matches", () => {
  assert.equal(render("[foo\\bar]\n\n[foobar]: /url\n"), "<p>[foo\\bar]</p>");
  assert.equal(render("[bar][foo\\!]\n\n[foo!]: /url\n"), "<p>[bar][foo!]</p>");
  assert.equal(render("[foo\\\\bar]\n\n[foo\\bar]: /url\n"), "<p>[foo\\bar]</p>");
  const same = render("[foo\\bar]\n\n[foo\\bar]: /url \"ti\\*tle\"\n");
  assert.equal(hrefOf(same), "/url");
  assert.equal(titleOf(same), "ti*tle");
  assert.match(same, />foo\\bar<\/a>/);
  const bang = render("[foo\\!]\n\n[foo\\!]: /url\n");
  assert.equal(hrefOf(bang), "/url");
  assert.match(bang, />foo!<\/a>/);
  const folded = render("[FOO\\BAR]\n\n[foo\\bar]: /url\n");
  assert.equal(hrefOf(folded), "/url");
  assert.match(folded, />FOO\\BAR<\/a>/);
  const bracket = render("[foo][ref\\[]\n\n[ref\\[]: /uri\n");
  assert.equal(hrefOf(bracket), "/uri");
  assert.match(bracket, />foo<\/a>/);
});

test("streaming stays plain and the docs stay on OpenAPI 0.18.0", () => {
  assert.equal(protectMarkdownEscapes("<http://example.com?find=\\*>", false), "<http://example.com?find=\\*>");
  assert.match(escapeSrc, /v1\.91/);
  assert.match(escapeSrc, /autolinkRanges/);
  assert.match(escapeSrc, /slashLiteralRanges/);
  assert.match(escapeSrc, /rawHtmlBlockRanges/);
  assert.match(refSrc, /foo\\!/);
  assert.match(swift, /v1\.91/);
  assert.match(swift, /autolinkSpans/);
  assert.match(swift, /slashLiteralSpans/);
  assert.match(swift, /htmlBlockLineEnd/);
  assert.match(swift, /MarkdownHtmlLiteral\.htmlTagEnd/);
  assert.match(refSwift, /foo\\!/);
  assert.doesNotMatch(refSwift, /out\.append\(chars\[i \+ 1\]\)/);
  assert.match(body, /protectMarkdownEscapes\(mathText, completed\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectMarkdownEscapes\(reply\.content/);
  assert.doesNotMatch(escapeSrc, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.91 /);
  assert.match(spec, /## 191\. v1\.91/);
  assert.match(spec, /example\.com\?find=/);
  assert.match(ci, /test_ios_markdown_backslash\.py/);
  assert.match(pkg, /markdownBackslash\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(escapeSrc, /computerPane/);
  assert.doesNotMatch(swift, /computerPane/);
});
