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
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { htmlTagEnd, literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { headingInlineSource, splitSetextHeadings } from "./markdownSetext.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const FF = "\u000c";

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
  "v2.06 cmark-gfm HTML tag form feeds in completed assistant replies";

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
}

test("form feed is cmark tag whitespace and ends an unquoted value", () => {
  const attr = `<a${FF}href="*bar*">`;
  assert.equal(htmlTagEnd(attr, 0), attr.length);
  assert.equal(htmlTagEnd(`<a${FF}${FF}href="*bar*">`, 0), `<a${FF}${FF}href="*bar*">`.length);
  assert.equal(htmlTagEnd(`</a${FF}>`, 0), `</a${FF}>`.length);
  assert.equal(htmlTagEnd(`<br${FF}>`, 0), `<br${FF}>`.length);
  assert.equal(htmlTagEnd(`<a href${FF}=${FF}"*bar*">`, 0), `<a href${FF}=${FF}"*bar*">`.length);
  assert.equal(htmlTagEnd(`<a href="x"${FF}title="*bar*">`, 0), `<a href="x"${FF}title="*bar*">`.length);
  assert.equal(htmlTagEnd(`<a${FF}\nhref="*bar*">`, 0), `<a${FF}\nhref="*bar*">`.length);
  assert.equal(htmlTagEnd(`<a href="x${FF}">`, 0), `<a href="x${FF}">`.length);
  assert.equal(htmlTagEnd(`<a href=x${FF}>`, 0), `<a href=x${FF}>`.length);
  assert.equal(htmlTagEnd(`<a href=x${FF}*bar*>`, 0), -1);
  assert.equal(htmlTagEnd(`<a${FF}\n\nhref="*bar*">`, 0), -1);
  assert.equal(htmlTagEnd(`<a href="*bar*">`, 0), `<a href="*bar*">`.length);
  assert.equal(htmlTagEnd("<br />", 0), 6);
});

test("a form feed keeps emphasis out of a tag and lets it run after an unquoted value", () => {
  assertHtml(`see <a${FF}href="*bar*">`, `<p>see &lt;a${FF}href=&quot;*bar*&quot;&gt;</p>`);
  assertHtml(
    `see <a${FF}href="**bar**">`,
    `<p>see &lt;a${FF}href=&quot;**bar**&quot;&gt;</p>`,
  );
  assertHtml(`see <a href=x${FF}*bar*>`, `<p>see &lt;a href=x${FF}<em>bar</em>&gt;</p>`);
  assertHtml(
    `see <a${FF}href="*yes*"> and <a href=x${FF}*no*>`,
    `<p>see &lt;a${FF}href=&quot;*yes*&quot;&gt; and &lt;a href=x${FF}<em>no</em>&gt;</p>`,
  );
  assertHtml(
    `see <a href${FF}=${FF}"*bar*">`,
    `<p>see &lt;a href${FF}=${FF}&quot;*bar*&quot;&gt;</p>`,
  );
  assertHtml(
    `see <a href="x"${FF}title="*bar*">`,
    `<p>see &lt;a href=&quot;x&quot;${FF}title=&quot;*bar*&quot;&gt;</p>`,
  );
  assertHtml(`see </a${FF}> *bar*`, `<p>see &lt;/a${FF}&gt; <em>bar</em></p>`);
  assertHtml(`see <br${FF}> *bar*`, `<p>see &lt;br${FF}&gt; <em>bar</em></p>`);
  assertHtml(`see <a${FF}${FF}href="*bar*">`, `<p>see &lt;a${FF}${FF}href=&quot;*bar*&quot;&gt;</p>`);
  assertHtml(
    `foo <a${FF}href="*bar*">\n---`,
    `<h2>foo &lt;a${FF}href=&quot;*bar*&quot;&gt;</h2>`,
  );
  assertHtml(
    `foo <a href=x${FF}*bar*>\n---`,
    `<h2>foo &lt;a href=x${FF}<em>bar</em>&gt;</h2>`,
  );
  assertHtml(
    `foo <a${FF}href="*bar*">\n===`,
    `<h1>foo &lt;a${FF}href=&quot;*bar*&quot;&gt;</h1>`,
  );
  assertHtml(
    `see <a${FF}\nhref="*bar*">`,
    `<p>see &lt;a${FF}\nhref=&quot;*bar*&quot;&gt;</p>`,
  );
  assertHtml(
    `see <a${FF}\n\nhref="*bar*">`,
    `<p>see &lt;a${FF}</p><p>href=&quot;<em>bar</em>&quot;&gt;</p>`,
  );
  assertHtml(
    `a  \nsee <a${FF}href="*b*">`,
    `<p>a<br/>\nsee &lt;a${FF}href=&quot;*b*&quot;&gt;</p>`,
  );
  assertHtml(
    `see <a${FF}href="*bar*  \nyes">`,
    `<p>see &lt;a${FF}href=&quot;*bar*  \nyes&quot;&gt;</p>`,
  );
  assertHtml(`- see <a${FF}href="*bar*">`, `<ul><li>see &lt;a${FF}href=&quot;*bar*&quot;&gt;</li></ul>`);
  assertHtml(
    `> quote <a${FF}href="*bar*">`,
    `<blockquote><p>quote &lt;a${FF}href=&quot;*bar*&quot;&gt;</p></blockquote>`,
  );
  assertHtml(
    `> foo <a${FF}href="*bar*">\n> ---`,
    `<blockquote><h2>foo &lt;a${FF}href=&quot;*bar*&quot;&gt;</h2></blockquote>`,
  );
  assertHtml(
    `[see <a${FF}href="*bar*">](http://example.com)`,
    `<p><a href="http://example.com">see &lt;a${FF}href=&quot;*bar*&quot;&gt;</a></p>`,
  );
  assertHtml(
    `[see <a href=x${FF}*bar*>](http://example.com)`,
    `<p><a href="http://example.com">see &lt;a href=x${FF}<em>bar</em>&gt;</a></p>`,
  );
  assertHtml(`see <br> *bar*`, `<p>see <br/>\n<em>bar</em></p>`);
  assertHtml(`foo<br>bar`, `<p>foo<br/>bar</p>`);
  assertHtml(
    `Press <kbd>**Ctrl**</kbd>`,
    `<p>Press <kbd><strong>Ctrl</strong></kbd></p>`,
  );
  assertHtml(`see <a href="*bar*">`, `<p>see &lt;a href=&quot;*bar*&quot;&gt;</p>`);
  assertHtml(
    `see <!DOCTYPE${FF}*bar*>`,
    `<p>see &lt;!DOCTYPE${FF}*bar*&gt;</p>`,
  );
});

test("a block that opens only because of a form feed stays raw", () => {
  const block = renderReply(`<a${FF}href="*bar*">\n---`);
  assert.doesNotMatch(block, /<em>/);
  assert.doesNotMatch(block, /<h[12]>/);
  assert.doesNotMatch(block, /<hr/);
  assert.match(block, /\*bar\*/);
  assert.match(block, /---/);
  assert.ok(block.includes(FF));

  const interrupted = renderReply(`foo\n<a${FF}href="*bar*">\n---`);
  assert.match(norm(interrupted), new RegExp(`<h2>foo&lt;a${FF}href=&quot;\\*bar\\*&quot;&gt;</h2>`));
  assert.doesNotMatch(interrupted, /<em>/);

  const div = renderReply(`foo\n<div${FF}>\n*bar*`);
  assert.match(div, /<p>foo<\/p>/);
  assert.doesNotMatch(div, /<em>/);
  assert.match(div, /\*bar\*/);
  assert.ok(div.includes(FF));

  const quoted = renderReply(`<a href="x${FF}">\n*bar*`);
  assert.doesNotMatch(quoted, /<em>/);
  assert.match(quoted, /\*bar\*/);
  assert.ok(quoted.includes(FF));

  assertHtml("see `<a" + FF + 'href="*bar*">`', `<p>see <code>&lt;a${FF}href=&quot;*bar*&quot;&gt;</code></p>`);
  assertHtml(
    "```\n<a" + FF + 'href="*bar*">\n```',
    `<pre><code>&lt;a${FF}href=&quot;*bar*&quot;&gt;\n</code></pre>`,
  );
  assertHtml(
    "foo\n\n    <a" + FF + 'href="*bar*">',
    `<p>foo</p><pre><code>&lt;a${FF}href=&quot;*bar*&quot;&gt;\n</code></pre>`,
  );
  assertHtml(
    "foo\n    <a" + FF + 'href="*bar*">',
    `<p>foo\n&lt;a${FF}href=&quot;*bar*&quot;&gt;</p>`,
  );
  assert.equal(literalizeRawHtml(`see <a${FF}href="*bar*">`, false), `see <a${FF}href="*bar*">`);
  const stashed = literalizeRawHtml(`see <a${FF}href="*bar*">`, true);
  assert.match(stashed, /§§SBE/);
  assert.equal(stashed.includes("<"), false);
  const opened = literalizeRawHtml(`see <a href=x${FF}*bar*>`, true);
  assert.match(opened, /§§SBE00003C§§a href/);
});

test("both clients share the form-feed tag rule and the reply path", () => {
  assert.match(src, /v2\.06/);
  assert.match(src, /function formFeedOpensBlock/);
  assert.match(src, /function isFormFeedUnquotedTag/);
  assert.match(src, /U\+000C/);
  assert.match(src, /<a\\fhref="\*bar\*">/);
  assert.match(src, /<a href=x\\f\*bar\*>/);
  assert.match(swift, /v2\.06/);
  assert.match(swift, /func formFeedOpensBlock/);
  assert.match(swift, /func isFormFeedUnquotedTag/);
  assert.match(swift, /U\+000C/);
  assert.match(swift, /<a\\fhref="\*bar\*">/);
  assert.match(swift, /<a href=x\\f\*bar\*>/);
  assert.match(swift, /\\u\{000C\}/);
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
  assert.ok(roadmap.includes("/ v2.06 "));
  assert.match(spec, /## 206\. v2\.06/);
  assert.match(ci, /test_ios_markdown_html_space\.py/);
  assert.match(pkg, /markdownHtmlSpace\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
