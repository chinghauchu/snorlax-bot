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
import { cmarkHtmlCdataEnd, cmarkHtmlPiEnd, literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { headingInlineSource, splitSetextHeadings } from "./markdownSetext.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

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
  "v2.05 cmark-gfm inline HTML processing instruction and CDATA closers in completed assistant replies";

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
        em: ({ children }) => React.createElement("em", null, restoreChildren(children)),
        li: ({ children }) => React.createElement("li", null, restoreChildren(children)),
        p: ({ children }) => React.createElement("p", null, restoreChildren(children)),
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
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, "");
}

function assertHtml(markdown: string, html: string): void {
  const actual = norm(renderReply(markdown));
  assert.equal(actual, norm(html), `${JSON.stringify(markdown)}\n${actual}`);
  assert.doesNotMatch(actual, /§§SBE/);
}

test("the cmark-gfm closers reject an extra ? or ] and keep a later closer", () => {
  assert.equal(cmarkHtmlPiEnd("<? *bar*?>", 0), "<? *bar*?>".length);
  assert.equal(cmarkHtmlPiEnd("<? *bar*???>", 0), "<? *bar*???>".length);
  assert.equal(cmarkHtmlPiEnd("<??>", 0), 4);
  assert.equal(cmarkHtmlPiEnd("<?php *bar*?>", 0), "<?php *bar*?>".length);
  assert.equal(cmarkHtmlPiEnd("<? *bar*?>>", 0), "<? *bar*?>".length);
  assert.equal(cmarkHtmlPiEnd("<? *no*??> *yes*?>", 0), "<? *no*??> *yes*?>".length);
  assert.equal(cmarkHtmlPiEnd("<? *yes*??> and <? *no*?>", 0), "<? *yes*??> and <? *no*?>".length);
  assert.equal(cmarkHtmlPiEnd("<? *bar*??>", 0), -1);
  assert.equal(cmarkHtmlPiEnd("<? *bar*????>", 0), -1);
  assert.equal(cmarkHtmlPiEnd("<?>", 0), -1);
  assert.equal(cmarkHtmlPiEnd("<? *bar* ? >", 0), -1);
  const shiftedPi = "see <? *bar*?>";
  assert.equal(cmarkHtmlPiEnd(shiftedPi, 4), 4 + "<? *bar*?>".length);

  assert.equal(cmarkHtmlCdataEnd("<![CDATA[ *bar*]]>", 0), "<![CDATA[ *bar*]]>".length);
  assert.equal(cmarkHtmlCdataEnd("<![CDATA[]]>", 0), "<![CDATA[]]>".length);
  assert.equal(cmarkHtmlCdataEnd("<![CDATA[a]]]>b]]>", 0), "<![CDATA[a]]]>b]]>".length);
  const swallowed = "<![CDATA[ *yes*]]]> and <![CDATA[ *no*]]>";
  assert.equal(cmarkHtmlCdataEnd(swallowed, 0), swallowed.length);
  assert.equal(cmarkHtmlCdataEnd("<![CDATA[ *bar*]]]>", 0), -1);
  assert.equal(cmarkHtmlCdataEnd("<![CDATA[]]]]>", 0), -1);
  assert.equal(cmarkHtmlCdataEnd("<![CDATA[ *bar*]] ]>", 0), -1);
  const shiftedCdata = "see <![CDATA[foo]]>";
  assert.equal(cmarkHtmlCdataEnd(shiftedCdata, 4), 4 + "<![CDATA[foo]]>".length);
});

test("a rejected instruction or CDATA emphasizes and a following rule stays a heading", () => {
  assertHtml("see <? *bar*??>", "<p>see &lt;? <em>bar</em>??&gt;</p>");
  assertHtml("foo <? **bar**??>", "<p>foo &lt;? <strong>bar</strong>??&gt;</p>");
  assertHtml("see <? *bar*????>", "<p>see &lt;? <em>bar</em>????&gt;</p>");
  assertHtml("see <?*bar*??>", "<p>see &lt;?<em>bar</em>??&gt;</p>");
  assertHtml(
    "see <![CDATA[ *bar*]]]>",
    "<p>see &lt;![CDATA[ <em>bar</em>]]]&gt;</p>",
  );
  assertHtml(
    "see <![CDATA[ **bar**]]]>",
    "<p>see &lt;![CDATA[ <strong>bar</strong>]]]&gt;</p>",
  );
  assertHtml(
    "see <![CDATA[*bar*]]]>",
    "<p>see &lt;![CDATA[<em>bar</em>]]]&gt;</p>",
  );
  assertHtml(
    "see <? *yes*??> now *no*",
    "<p>see &lt;? <em>yes</em>??&gt; now <em>no</em></p>",
  );
  assertHtml(
    "see <? *bar*??> and <![CDATA[ *yes*]]]>",
    "<p>see &lt;? <em>bar</em>??&gt; and &lt;![CDATA[ <em>yes</em>]]]&gt;</p>",
  );
  assertHtml(
    "see <!-- *no* --> and <? *yes*??>",
    "<p>see &lt;!-- *no* --&gt; and &lt;? <em>yes</em>??&gt;</p>",
  );
  assertHtml("foo <? *bar*??>\n---", "<h2>foo &lt;? <em>bar</em>??&gt;</h2>");
  assertHtml(
    "foo <![CDATA[ *bar*]]]>\n===",
    "<h1>foo &lt;![CDATA[ <em>bar</em>]]]&gt;</h1>",
  );
  assertHtml(
    "foo <? **bar**??>\n---",
    "<h2>foo &lt;? <strong>bar</strong>??&gt;</h2>",
  );
  assertHtml(
    "a  \nsee <? *b*??>",
    "<p>a<br/>\nsee &lt;? <em>b</em>??&gt;</p>",
  );
  assertHtml(
    "see <? *bar*  \n*yes*??>",
    "<p>see &lt;? <em>bar</em><br/>\n<em>yes</em>??&gt;</p>",
  );
  assertHtml("- see <? *bar*??>", "<ul><li>see &lt;? <em>bar</em>??&gt;</li></ul>");
  assertHtml(
    "- see <![CDATA[ *bar*]]]>",
    "<ul><li>see &lt;![CDATA[ <em>bar</em>]]]&gt;</li></ul>",
  );
  assertHtml(
    "> quote <? *bar*??>",
    "<blockquote><p>quote &lt;? <em>bar</em>??&gt;</p></blockquote>",
  );
  assertHtml(
    "> quote <![CDATA[ *bar*]]]>",
    "<blockquote><p>quote &lt;![CDATA[ <em>bar</em>]]]&gt;</p></blockquote>",
  );
  assertHtml(
    "> foo <? *bar*??>\n> ---",
    "<blockquote><h2>foo &lt;? <em>bar</em>??&gt;</h2></blockquote>",
  );
  assertHtml(
    "[see <? *bar*??>](http://example.com)",
    '<p><a href="http://example.com">see &lt;? <em>bar</em>??&gt;</a></p>',
  );
  assertHtml(
    "[see <![CDATA[ *bar*]]]>](http://example.com)",
    "<p>[see &lt;![CDATA[ <em>bar</em>]]]&gt;](http://example.com)</p>",
  );
  assertHtml(
    "foo\n    <? *bar*??>",
    "<p>foo\n&lt;? <em>bar</em>??&gt;</p>",
  );
});

test("accepted closers, HTML blocks, and code stay literal", () => {
  assertHtml("see <? *bar*?>", "<p>see &lt;? *bar*?&gt;</p>");
  assertHtml("see <? *bar*???> tail", "<p>see &lt;? *bar*???&gt; tail</p>");
  assertHtml("see <??> *bar*", "<p>see &lt;??&gt; <em>bar</em></p>");
  assertHtml("see <? *bar*?>>x", "<p>see &lt;? *bar*?&gt;&gt;x</p>");
  assertHtml(
    "see <? *no*??> *yes*?>",
    "<p>see &lt;? *no*??&gt; *yes*?&gt;</p>",
  );
  assertHtml(
    "see <? *yes*??> and <? *no*?>",
    "<p>see &lt;? *yes*??&gt; and &lt;? *no*?&gt;</p>",
  );
  assertHtml("see <? *no*?> and *yes*", "<p>see &lt;? *no*?&gt; and <em>yes</em></p>");
  assertHtml("see <![CDATA[ *bar*]]>", "<p>see &lt;![CDATA[ *bar*]]&gt;</p>");
  assertHtml(
    "see <![CDATA[ *yes*]]]> and <![CDATA[ *no*]]>",
    "<p>see &lt;![CDATA[ *yes*]]]&gt; and &lt;![CDATA[ *no*]]&gt;</p>",
  );
  assertHtml(
    "see <![CDATA[ *bar*]]>*yes*",
    "<p>see &lt;![CDATA[ *bar*]]&gt;<em>yes</em></p>",
  );
  assertHtml("foo <? *bar*?>\n---", "<h2>foo &lt;? *bar*?&gt;</h2>");
  assertHtml(
    "foo <? *no*??>\n*yes*?>\n---",
    "<h2>foo &lt;? *no*??&gt;\n*yes*?&gt;</h2>",
  );
  assertHtml(
    "see <![CDATA[ *yes*]]]> and <![CDATA[ *no*]]>\n---",
    "<h2>see &lt;![CDATA[ *yes*]]]&gt; and &lt;![CDATA[ *no*]]&gt;</h2>",
  );

  const block = renderReply("<? *bar*??>");
  assert.doesNotMatch(block, /<em>/);
  assert.match(block, /\*bar\*/);
  assert.doesNotMatch(block, /§§SBE/);

  const cdataBlock = renderReply("<![CDATA[ *bar*]]]>");
  assert.doesNotMatch(cdataBlock, /<em>/);
  assert.match(cdataBlock, /\*bar\*/);

  const after = renderReply("foo\n<? *bar*??>\n---");
  assert.match(after, /<p>foo<\/p>/);
  assert.doesNotMatch(after, /<em>/);
  assert.match(after, /\*bar\*/);
  assert.match(norm(after), /<hr\/>/);
  assert.doesNotMatch(after, /<h[12]>/);

  const indented = renderReply("foo\n   <? *bar*??>");
  assert.doesNotMatch(indented, /<em>/);
  assert.match(indented, /\*bar\*/);

  const lineAndYes = renderReply("<? *bar*??> and *yes*");
  assert.doesNotMatch(lineAndYes, /<em>/);
  assert.match(lineAndYes, /\*yes\*/);

  assertHtml("see `<? *bar*??>` now", "<p>see <code>&lt;? *bar*??&gt;</code> now</p>");
  assertHtml(
    "```\n<? *bar*??>\n```",
    "<pre><code>&lt;? *bar*??&gt;\n</code></pre>",
  );
  assertHtml(
    "foo\n\n    <? *bar*??>",
    "<p>foo</p><pre><code>&lt;? *bar*??&gt;\n</code></pre>",
  );
  assertHtml(
    "- foo\n\n      <? *bar*??>",
    "<ul><li><p>foo</p><pre><code>&lt;? *bar*??&gt;\n</code></pre></li></ul>",
  );
  assert.equal(literalizeRawHtml("see <? *bar*??>", false), "see <? *bar*??>");
  const stashed = literalizeRawHtml("see <? *bar*??>", true);
  assert.match(stashed, /§§SBE00003C§§\?/);
  assert.equal(stashed.includes("<"), false);
  const cdataStashed = literalizeRawHtml("see <![CDATA[ *bar*]]]>", true);
  assert.match(cdataStashed, /§§SBE00003C§§!\[CDATA\[/);
  const kept = literalizeRawHtml("see <? *bar*?>", true);
  assert.equal(kept.includes("<?"), false);
  assert.match(kept, /§§SBE/);
});

test("both clients share the instruction and CDATA closer rule and the reply path", () => {
  assert.match(src, /v2\.05/);
  assert.match(src, /function cmarkHtmlPiEnd/);
  assert.match(src, /function cmarkHtmlCdataEnd/);
  assert.match(src, /function isInvalidHtmlPi/);
  assert.match(src, /function isInvalidHtmlCdata/);
  assert.match(src, /function scanHtmlPi/);
  assert.match(src, /function scanHtmlCdata/);
  assert.match(src, /<\? \*bar\*\?\?>/);
  assert.match(src, /<!\[CDATA\[ \*bar\*\]\]\]>/);
  assert.match(src, /stashMarkdownText\("<"\)/);
  assert.match(swift, /v2\.05/);
  assert.match(swift, /func cmarkHtmlPiEnd/);
  assert.match(swift, /func cmarkHtmlCdataEnd/);
  assert.match(swift, /func isInvalidHtmlPi/);
  assert.match(swift, /func isInvalidHtmlCdata/);
  assert.match(swift, /func scanHtmlPi/);
  assert.match(swift, /func scanHtmlCdata/);
  assert.match(swift, /<\? \*bar\*\?\?>/);
  assert.match(swift, /<!\[CDATA\[ \*bar\*\]\]\]>/);
  assert.match(swift, /token\("<"\)/);
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
  assert.ok(roadmap.includes("/ v2.05 "));
  assert.match(spec, /## 205\. v2\.05/);
  assert.match(ci, /test_ios_markdown_html_closer\.py/);
  assert.match(pkg, /markdownHtmlCloser\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
