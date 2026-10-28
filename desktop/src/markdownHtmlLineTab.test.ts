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
import { LINE_TAB_STASH, protectEmphasisWhitespace } from "./markdownEmphasis.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { htmlTagEnd, literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { headingInlineSource, splitSetextHeadings } from "./markdownSetext.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const VT = "\u000b";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const src = read(join(here, "markdownHtmlLiteral.ts"));
const swift = read(join(root, "ios", "SnorlaxBot", "MarkdownHtmlLiteral.swift"));
const listSrc = read(join(here, "markdownList.ts"));
const listSwift = read(join(root, "ios", "SnorlaxBot", "MarkdownList.swift"));
const emphasisSrc = read(join(here, "markdownEmphasis.ts"));
const emphasisSwift = read(join(root, "ios", "SnorlaxBot", "MarkdownEmphasis.swift"));
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
  "v2.07 cmark-gfm HTML tag line tabulation in completed assistant replies";

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
        ul: ({ children }) => React.createElement("ul", null, restoreChildren(children)),
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
  assert.doesNotMatch(actual, /§§SBE|SBW00000B|\uE000/);
}

test("line tabulation is cmark tag whitespace, raw or stashed", () => {
  const attr = `<a${VT}href="*bar*">`;
  const stashed = protectEmphasisWhitespace(attr);
  assert.equal(stashed, `<a${LINE_TAB_STASH}href="*bar*">`);
  assert.equal(htmlTagEnd(attr, 0), attr.length);
  assert.equal(htmlTagEnd(stashed, 0), stashed.length);
  assert.equal(htmlTagEnd(`<a${VT}${VT}href="*bar*">`, 0), `<a${VT}${VT}href="*bar*">`.length);
  assert.equal(htmlTagEnd(`</a${VT}>`, 0), `</a${VT}>`.length);
  assert.equal(htmlTagEnd(`<br${VT}>`, 0), `<br${VT}>`.length);
  assert.equal(htmlTagEnd(`<a href${VT}=${VT}"*bar*">`, 0), `<a href${VT}=${VT}"*bar*">`.length);
  assert.equal(htmlTagEnd(`<a href="x"${VT}title="*bar*">`, 0), `<a href="x"${VT}title="*bar*">`.length);
  assert.equal(htmlTagEnd(`<a${VT}\nhref="*bar*">`, 0), `<a${VT}\nhref="*bar*">`.length);
  assert.equal(htmlTagEnd(`<a href="x${VT}">`, 0), `<a href="x${VT}">`.length);
  assert.equal(htmlTagEnd(`<a href=x${VT}>`, 0), `<a href=x${VT}>`.length);
  assert.equal(htmlTagEnd(`<a href=x${VT}*bar*>`, 0), -1);
  assert.equal(htmlTagEnd(`<a href=x${LINE_TAB_STASH}*bar*>`, 0), -1);
  assert.equal(htmlTagEnd(`<a${VT}\n\nhref="*bar*">`, 0), -1);
  assert.equal(htmlTagEnd(`<a href="*bar*">`, 0), `<a href="*bar*">`.length);
  assert.equal(htmlTagEnd("<br />", 0), 6);
  assert.equal(htmlTagEnd(`see <!DOCTYPE${VT}*bar*>`, 4), `see <!DOCTYPE${VT}*bar*>`.length);
  assert.equal(
    htmlTagEnd(`see <!DOCTYPE${LINE_TAB_STASH}*bar*>`, 4),
    `see <!DOCTYPE${LINE_TAB_STASH}*bar*>`.length,
  );
});

test("a line tab keeps emphasis out of a tag and lets it run after an unquoted value", () => {
  assertHtml(`see <a${VT}href="*bar*">`, `<p>see &lt;a${VT}href=&quot;*bar*&quot;&gt;</p>`);
  assertHtml(
    `see <a${VT}href="**bar**">`,
    `<p>see &lt;a${VT}href=&quot;**bar**&quot;&gt;</p>`,
  );
  assertHtml(`see <a href=x${VT}*bar*>`, `<p>see &lt;a href=x${VT}<em>bar</em>&gt;</p>`);
  assertHtml(
    `see <a${VT}href="*yes*"> and <a href=x${VT}*no*>`,
    `<p>see &lt;a${VT}href=&quot;*yes*&quot;&gt; and &lt;a href=x${VT}<em>no</em>&gt;</p>`,
  );
  assertHtml(
    `see <a href${VT}=${VT}"*bar*">`,
    `<p>see &lt;a href${VT}=${VT}&quot;*bar*&quot;&gt;</p>`,
  );
  assertHtml(
    `see <a href="x"${VT}title="*bar*">`,
    `<p>see &lt;a href=&quot;x&quot;${VT}title=&quot;*bar*&quot;&gt;</p>`,
  );
  assertHtml(`see </a${VT}> *bar*`, `<p>see &lt;/a${VT}&gt; <em>bar</em></p>`);
  assertHtml(`see <br${VT}> *bar*`, `<p>see &lt;br${VT}&gt; <em>bar</em></p>`);
  assertHtml(`see <a${VT}${VT}href="*bar*">`, `<p>see &lt;a${VT}${VT}href=&quot;*bar*&quot;&gt;</p>`);
  assertHtml(
    `foo <a${VT}href="*bar*">\n---`,
    `<h2>foo &lt;a${VT}href=&quot;*bar*&quot;&gt;</h2>`,
  );
  assertHtml(
    `foo <a href=x${VT}*bar*>\n---`,
    `<h2>foo &lt;a href=x${VT}<em>bar</em>&gt;</h2>`,
  );
  assertHtml(
    `foo <a${VT}href="*bar*">\n===`,
    `<h1>foo &lt;a${VT}href=&quot;*bar*&quot;&gt;</h1>`,
  );
  assertHtml(
    `see <a${VT}\nhref="*bar*">`,
    `<p>see &lt;a${VT}\nhref=&quot;*bar*&quot;&gt;</p>`,
  );
  assertHtml(
    `see <a${VT}\n\nhref="*bar*">`,
    `<p>see &lt;a${VT}</p><p>href=&quot;<em>bar</em>&quot;&gt;</p>`,
  );
  assertHtml(
    `a  \nsee <a${VT}href="*b*">`,
    `<p>a<br/>\nsee &lt;a${VT}href=&quot;*b*&quot;&gt;</p>`,
  );
  assertHtml(
    `see <a${VT}href="*bar*  \nyes">`,
    `<p>see &lt;a${VT}href=&quot;*bar*  \nyes&quot;&gt;</p>`,
  );
  assertHtml(`- see <a${VT}href="*bar*">`, `<ul><li>see &lt;a${VT}href=&quot;*bar*&quot;&gt;</li></ul>`);
  assertHtml(
    `> quote <a${VT}href="*bar*">`,
    `<blockquote><p>quote &lt;a${VT}href=&quot;*bar*&quot;&gt;</p></blockquote>`,
  );
  assertHtml(
    `> foo <a${VT}href="*bar*">\n> ---`,
    `<blockquote><h2>foo &lt;a${VT}href=&quot;*bar*&quot;&gt;</h2></blockquote>`,
  );
  assertHtml(
    `[see <a${VT}href="*bar*">](http://example.com)`,
    `<p><a href="http://example.com">see &lt;a${VT}href=&quot;*bar*&quot;&gt;</a></p>`,
  );
  assertHtml(
    `[see <a href=x${VT}*bar*>](http://example.com)`,
    `<p><a href="http://example.com">see &lt;a href=x${VT}<em>bar</em>&gt;</a></p>`,
  );
  assertHtml(`see <br> *bar*`, `<p>see <br/>\n<em>bar</em></p>`);
  assertHtml(`foo<br>bar`, `<p>foo<br/>bar</p>`);
  assertHtml(
    `Press <kbd>**Ctrl**</kbd>`,
    `<p>Press <kbd><strong>Ctrl</strong></kbd></p>`,
  );
  assertHtml(`see <a href="*bar*">`, `<p>see &lt;a href=&quot;*bar*&quot;&gt;</p>`);
  assertHtml(
    `see <!DOCTYPE${VT}*bar*>`,
    `<p>see &lt;!DOCTYPE${VT}*bar*&gt;</p>`,
  );
  assertHtml(`*${VT}a${VT}*`, `<p><em>${VT}a${VT}</em></p>`);
});

test("a block that opens only because of a line tab stays raw", () => {
  const block = renderReply(`<a${VT}href="*bar*">\n---`);
  assert.doesNotMatch(block, /<em>/);
  assert.doesNotMatch(block, /<h[12]>/);
  assert.doesNotMatch(block, /<hr/);
  assert.doesNotMatch(block, /SBW00000B|\uE000/);
  assert.match(block, /\*bar\*/);
  assert.match(block, /---/);
  assert.ok(block.includes(VT));

  const interrupted = renderReply(`foo\n<a${VT}href="*bar*">\n---`);
  assert.match(norm(interrupted), new RegExp(`<h2>foo&lt;a${VT}href=&quot;\\*bar\\*&quot;&gt;</h2>`));
  assert.doesNotMatch(interrupted, /<em>|SBW00000B|\uE000/);

  const div = renderReply(`foo\n<div${VT}>\n*bar*`);
  assert.match(div, /<p>foo<\/p>/);
  assert.doesNotMatch(div, /<em>|SBW00000B|\uE000/);
  assert.match(div, /\*bar\*/);
  assert.ok(div.includes(VT));

  const quoted = renderReply(`<a href="x${VT}">\n*bar*`);
  assert.doesNotMatch(quoted, /<em>|SBW00000B|\uE000/);
  assert.match(quoted, /\*bar\*/);
  assert.ok(quoted.includes(VT));

  assertHtml("see `<a" + VT + 'href="*bar*">`', `<p>see <code>&lt;a${VT}href=&quot;*bar*&quot;&gt;</code></p>`);
  assertHtml(
    "```\n<a" + VT + 'href="*bar*">\n```',
    `<pre><code>&lt;a${VT}href=&quot;*bar*&quot;&gt;\n</code></pre>`,
  );
  assertHtml(
    "foo\n\n    <a" + VT + 'href="*bar*">',
    `<p>foo</p><pre><code>&lt;a${VT}href=&quot;*bar*&quot;&gt;\n</code></pre>`,
  );
  assertHtml(
    "foo\n    <a" + VT + 'href="*bar*">',
    `<p>foo\n&lt;a${VT}href=&quot;*bar*&quot;&gt;</p>`,
  );
  assert.equal(literalizeRawHtml(`see <a${VT}href="*bar*">`, false), `see <a${VT}href="*bar*">`);
  assert.equal(protectMarkdownEscapes(`see <a${VT}href="*bar*">`, false), `see <a${VT}href="*bar*">`);
  const stashed = literalizeRawHtml(protectEmphasisWhitespace(`see <a${VT}href="*bar*">`), true);
  assert.match(stashed, /§§SBE/);
  assert.equal(stashed.includes("<"), false);
  const opened = literalizeRawHtml(protectEmphasisWhitespace(`see <a href=x${VT}*bar*>`), true);
  assert.match(opened, /§§SBE00003C§§a href/);
});

test("both clients share the line-tab tag rule and the reply path", () => {
  assert.match(src, /v2\.07/);
  assert.match(src, /function lineTabOpensBlock/);
  assert.match(src, /function isLineTabUnquotedTag/);
  assert.match(src, /U\+000B/);
  assert.match(src, /<a\\vhref="\*bar\*">/);
  assert.match(src, /<a href=x\\v\*bar\*>/);
  assert.match(swift, /v2\.07/);
  assert.match(swift, /func lineTabOpensBlock/);
  assert.match(swift, /func isLineTabUnquotedTag/);
  assert.match(swift, /U\+000B/);
  assert.match(swift, /<a\\vhref="\*bar\*">/);
  assert.match(swift, /<a href=x\\v\*bar\*>/);
  assert.match(swift, /\\u\{000B\}/);
  assert.match(listSrc, /lineTabStashAt/);
  assert.match(listSwift, /lineTabLength/);
  assert.match(emphasisSrc, /LINE_TAB_STASH/);
  assert.match(emphasisSwift, /lineTabToken/);
  assert.match(body, /literalizeRawHtml\(/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v2.07 "));
  assert.match(spec, /## 207\. v2\.07/);
  assert.match(ci, /test_ios_markdown_html_line_tab\.py/);
  assert.match(pkg, /markdownHtmlLineTab\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
