// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, HARD_BREAK_TOKEN, remarkHardBreaks } from "./markdownHardBreak.ts";
import { htmlTagEnd, literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { headingInlineSource, splitSetextHeadings } from "./markdownSetext.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const FF = "\u000c";
const VT = "\u000b";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const src = read(join(here, "markdownHtmlLiteral.ts"));
const swift = read(join(root, "ios", "SnorlaxBot", "MarkdownHtmlLiteral.swift"));
const body = read(join(here, "MarkdownBody.tsx"));
const app = read(join(here, "App.tsx"));
const roadmap = read(join(root, "ROADMAP.md"));
const spec = read(join(root, "docs", "specs", "v0.1-chat-and-agents.md"));
const ci = read(join(root, ".github", "workflows", "ci.yml"));
const pkg = read(join(here, "..", "package.json"));
const openapi = read(join(here, "..", "openapi.yaml"));
const protocol = read(join(root, "protocol", "openapi.yaml"));
const runtimeOpenapi = read(join(root, "runtime", "openapi.yaml"));

const PHRASE =
  "v2.08 cmark-gfm HTML tag whitespace between / and > in completed assistant replies";

function restoreChildren(node: ReactNode): ReactNode {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") return restoreMarkdownEscapes(child);
    if (!React.isValidElement(child)) return child;
    const props = child.props as { children?: ReactNode };
    if (props.children == null) return child;
    return React.cloneElement(child, {}, restoreChildren(props.children));
  });
}

/** Same prepare order a completed reply uses, then react-markdown. */
function renderChunk(text: string): string {
  const source = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(text, true), true),
      true,
    ),
    true,
  );
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      components: {
        a: ({ href, children }) =>
          React.createElement("a", { href }, restoreChildren(children)),
        blockquote: ({ children }) =>
          React.createElement("blockquote", null, restoreChildren(children)),
        code: ({ children }) => React.createElement("code", null, restoreChildren(children)),
        em: ({ children }) => React.createElement("em", null, restoreChildren(children)),
        h1: ({ children }) => React.createElement("h1", null, restoreChildren(children)),
        h2: ({ children }) => React.createElement("h2", null, restoreChildren(children)),
        li: ({ children }) => React.createElement("li", null, restoreChildren(children)),
        p: ({ children }) => React.createElement("p", null, restoreChildren(children)),
        pre: ({ children }) => React.createElement("pre", null, restoreChildren(children)),
        strong: ({ children }) =>
          React.createElement("strong", null, restoreChildren(children)),
      },
      children: source,
    }),
  );
}

function renderSetext(text: string): string {
  return splitSetextHeadings(text, true)
    .map((part) => {
      if (part.type !== "heading") return renderChunk(part.text);
      const tag = part.level === 1 ? "h1" : "h2";
      const inner = renderChunk(headingInlineSource(part.text)).replace(/<\/?p>/g, "");
      return `<${tag}>${inner}</${tag}>`;
    })
    .join("");
}

/** Quote peel, then setext, then the completed-reply prepare path. */
function renderReply(text: string): string {
  return splitQuoteAndTasks(text, true)
    .map((part) => {
      if (part.type === "quote") return `<blockquote>${renderSetext(part.text)}</blockquote>`;
      if (part.type === "markdown") return renderSetext(part.text);
      return "";
    })
    .join("");
}

function norm(html: string): string {
  return html
    .replace(/ class="[^"]*"/g, "")
    .replace(/<br\s*\/?>/g, "<br/>")
    .replace(/<hr\s*\/?>/g, "<hr/>")
    .replace(/>[ \t\n\r]+</g, "><")
    .replace(/[ \t\n\r]+/g, "");
}

function assertHtml(markdown: string, html: string): void {
  const actual = norm(renderReply(markdown));
  assert.equal(actual, norm(html), `${JSON.stringify(markdown)}\n${actual}`);
  assert.doesNotMatch(actual, /§§SBE/);
  assert.doesNotMatch(actual, /§§SBH/);
}

test("a slash is not tag whitespace before the closer", () => {
  assert.equal(htmlTagEnd("<br/ >", 0), -1);
  assert.equal(htmlTagEnd("<br / >", 0), -1);
  assert.equal(htmlTagEnd("<br/  >", 0), -1);
  assert.equal(htmlTagEnd("<br/\t>", 0), -1);
  assert.equal(htmlTagEnd("<br/\n>", 0), -1);
  assert.equal(htmlTagEnd(`<br/${FF}>`, 0), -1);
  assert.equal(htmlTagEnd(`<br/${VT}>`, 0), -1);
  assert.equal(htmlTagEnd('<img src="x"/ >', 0), -1);
  assert.equal(htmlTagEnd("<kbd/ >", 0), -1);
  assert.equal(htmlTagEnd("<sub/ >", 0), -1);
  assert.equal(htmlTagEnd("<sup / >", 0), -1);
  assert.equal(htmlTagEnd("<br />", 0), 6);
  assert.equal(htmlTagEnd("<br/>", 0), 5);
  assert.equal(htmlTagEnd("<br>", 0), 4);
  assert.equal(htmlTagEnd("<br\t/>", 0), 6);
  assert.equal(htmlTagEnd(`<br${FF}/>`, 0), `<br${FF}/>`.length);
  assert.equal(htmlTagEnd('<img src="x" />', 0), '<img src="x" />'.length);
  assert.equal(htmlTagEnd("<kbd />", 0), 7);
  assert.equal(htmlTagEnd("<a href=\"*bar*\">", 0), '<a href="*bar*">'.length);
});

test("whitespace between / and > stays characters and a real break stays a break", () => {
  assertHtml("foo<br/ >bar", "<p>foo&lt;br/ &gt;bar</p>");
  assertHtml("hello <br / > world", "<p>hello &lt;br / &gt; world</p>");
  assertHtml("see <br/  >x", "<p>see &lt;br/  &gt;x</p>");
  assertHtml("see <br/\t>x", "<p>see &lt;br/\t&gt;x</p>");
  assertHtml(`see <br/${FF}>x`, `<p>see &lt;br/${FF}&gt;x</p>`);
  assertHtml("**bold**<br/ >*em*", "<p><strong>bold</strong>&lt;br/ &gt;<em>em</em></p>");
  assertHtml("see <br/ > and *bar*", "<p>see &lt;br/ &gt; and <em>bar</em></p>");
  assertHtml(
    'see <a href="x"/ >*bar*',
    '<p>see &lt;a href=&quot;x&quot;/ &gt;<em>bar</em></p>',
  );
  assertHtml("see <img src=\"x\"/ > now", '<p>see &lt;img src=&quot;x&quot;/ &gt; now</p>');
  assertHtml("see <kbd/ >X", "<p>see &lt;kbd/ &gt;X</p>");
  assertHtml("see <sub/ >x", "<p>see &lt;sub/ &gt;x</p>");
  assertHtml("see <sup / >x", "<p>see &lt;sup / &gt;x</p>");
  assertHtml("Use <br/ > here.", "<p>Use &lt;br/ &gt; here.</p>");
  assertHtml("foo<br />bar", "<p>foo<br/>bar</p>");
  assertHtml("foo<br\t/>bar", "<p>foo<br/>bar</p>");
  assertHtml("foo<br/>bar", "<p>foo<br/>bar</p>");
  assertHtml("foo<br>bar", "<p>foo<br/>bar</p>");
  assertHtml("see <br> *bar*", "<p>see <br/>\n<em>bar</em></p>");
  assertHtml("Press <kbd>**Ctrl**</kbd>", "<p>Press <kbd><strong>Ctrl</strong></kbd></p>");
  assertHtml("see <kbd />", "<p>see <kbd></kbd></p>");
  assertHtml("see <a href=\"*bar*\">", '<p>see &lt;a href=&quot;*bar*&quot;&gt;</p>');
  assertHtml(`see <br${FF}> *bar*`, `<p>see &lt;br${FF}&gt; <em>bar</em></p>`);
  assertHtml(`see <br${VT}> *bar*`, `<p>see &lt;br${VT}&gt; <em>bar</em></p>`);
  const spaced = renderReply("see <br/  >x");
  assert.match(spaced, /&lt;br\/ {2}&gt;x/);
  assert.doesNotMatch(spaced, /<br/);
  const prepared = literalizeRawHtml(protectMarkdownEscapes("foo<br/ >bar", true), true);
  assert.equal(prepared.includes(HARD_BREAK_TOKEN), false);
  assert.equal(prepared.includes("<br/ >"), true);
});

test("the tag stays in the paragraph, the list, the quote, and the heading", () => {
  assertHtml("foo<br/ >bar\n---", "<h2>foo&lt;br/ &gt;bar</h2>");
  assertHtml("foo<br/ >bar\n===", "<h1>foo&lt;br/ &gt;bar</h1>");
  assertHtml("foo\n<br/ >\n---", "<h2>foo\n&lt;br/ &gt;</h2>");
  assertHtml("- see <br/ > *bar*", "<ul><li>see &lt;br/ &gt; <em>bar</em></li></ul>");
  assertHtml("> quote <br / > more", "<blockquote><p>quote &lt;br / &gt; more</p></blockquote>");
  assertHtml(
    "> foo<br/ >bar\n> ---",
    "<blockquote><h2>foo&lt;br/ &gt;bar</h2></blockquote>",
  );
  assertHtml(
    "[lab <br/ > el](http://example.com)",
    '<p><a href="http://example.com">lab &lt;br/ &gt; el</a></p>',
  );
  assertHtml("a  \nsee <br/ > b", "<p>a<br/>\nsee &lt;br/ &gt; b</p>");
  assertHtml("<div/ >\n*bar*", "<p>&lt;div/ &gt;\n<em>bar</em></p>");
  assertHtml("see `<br/ >` stays", "<p>see <code>&lt;br/ &gt;</code> stays</p>");
  assertHtml("```\n<br/ >\n```", "<pre><code>&lt;br/ &gt;\n</code></pre>");
  assertHtml("foo\n\n    <br/ >", "<p>foo</p><pre><code>&lt;br/ &gt;\n</code></pre>");
  assertHtml("foo\n    <br/ >", "<p>foo\n&lt;br/ &gt;</p>");
  assert.equal(literalizeRawHtml("foo<br/ >bar", false), "foo<br/ >bar");
  const block = renderReply("<div />\n*bar*");
  assert.doesNotMatch(block, /<em>/);
  assert.match(block, /\*bar\*/);
});

test("both clients share the slash-closer rule and the reply path", () => {
  for (const source of [src, swift]) {
    assert.match(source, /v2\.08/);
    assert.match(source, /no spacechar between/);
    assert.match(source, /<br\/ >/);
    assert.match(source, /<br \/>/);
    assert.match(source, /<kbd\/ >/);
    assert.doesNotMatch(source, /\/v1\//);
    assert.doesNotMatch(source, /computerPane/);
  }
  assert.match(body, /literalizeRawHtml\(/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v2.08 "));
  assert.match(spec, /## 208\. v2\.08/);
  assert.match(ci, /test_ios_markdown_html_slash\.py/);
  assert.match(pkg, /markdownHtmlSlash\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
