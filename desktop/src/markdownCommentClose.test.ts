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
import { cmarkHtmlCommentEnd, literalizeRawHtml } from "./markdownHtmlLiteral.ts";
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
  "v2.03 cmark-gfm inline HTML comment closers in completed assistant replies";

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

test("the cmark-gfm comment scanner accepts <!--> and rejects an extra hyphen", () => {
  assert.equal(cmarkHtmlCommentEnd("<!-- *bar* -->", 0), "<!-- *bar* -->".length);
  assert.equal(cmarkHtmlCommentEnd("<!-->", 0), 5);
  assert.equal(cmarkHtmlCommentEnd("<!--->", 0), 6);
  assert.equal(cmarkHtmlCommentEnd("<!---->", 0), "<!---->".length);
  assert.equal(cmarkHtmlCommentEnd("<!-- *bar*----->", 0), "<!-- *bar*----->".length);
  assert.equal(cmarkHtmlCommentEnd("<!-- *bar*--->", 0), -1);
  assert.equal(cmarkHtmlCommentEnd("<!-- *bar*---->", 0), -1);
  assert.equal(cmarkHtmlCommentEnd("<!-- *bar*------>", 0), -1);
  assert.equal(cmarkHtmlCommentEnd("<!----->", 0), -1);
  assert.equal(cmarkHtmlCommentEnd("<!-- *bar* --->", 0), -1);
  assert.equal(cmarkHtmlCommentEnd("<!--end--->", 0), -1);
  const shifted = "see <!-- *bar* -->";
  assert.equal(cmarkHtmlCommentEnd(shifted, 4), 4 + "<!-- *bar* -->".length);
});

test("a rejected inline comment emphasizes and a following rule stays a heading", () => {
  assertHtml(
    "see <!-- *bar*--->",
    "<p>see &lt;!-- <em>bar</em>---&gt;</p>",
  );
  assertHtml(
    "foo <!-- **bar**--->",
    "<p>foo &lt;!-- <strong>bar</strong>---&gt;</p>",
  );
  assertHtml(
    "a <!-- *b*----> c",
    "<p>a &lt;!-- <em>b</em>----&gt; c</p>",
  );
  assertHtml(
    "a <!-- *b*------> c",
    "<p>a &lt;!-- <em>b</em>------&gt; c</p>",
  );
  assertHtml(
    "a <!--*b*---> c",
    "<p>a &lt;!--<em>b</em>---&gt; c</p>",
  );
  assertHtml(
    "see <!-- *no* --> and <!-- *yes*--->",
    "<p>see &lt;!-- *no* --&gt; and &lt;!-- <em>yes</em>---&gt;</p>",
  );
  assertHtml(
    "foo <!--> *bar*",
    "<p>foo &lt;!--&gt; <em>bar</em></p>",
  );
  assertHtml(
    "foo <!---> *bar*",
    "<p>foo &lt;!---&gt; <em>bar</em></p>",
  );
  assertHtml(
    "foo <!-- *bar*--->\n---",
    "<h2>foo &lt;!-- <em>bar</em>---&gt;</h2>",
  );
  assertHtml(
    "foo <!-- *bar*\nbaz--->",
    "<p>foo &lt;!-- <em>bar</em>\nbaz---&gt;</p>",
  );
  assertHtml(
    "foo <!-- *bar*  \nbaz--->",
    "<p>foo &lt;!-- <em>bar</em><br/>\nbaz---&gt;</p>",
  );
  assertHtml(
    "- foo <!-- *bar*--->",
    "<ul><li>foo &lt;!-- <em>bar</em>---&gt;</li></ul>",
  );
  assertHtml(
    "> quote <!-- *bar*--->",
    "<blockquote><p>quote &lt;!-- <em>bar</em>---&gt;</p></blockquote>",
  );
  assertHtml(
    "[see <!-- *bar*--->](http://example.com)",
    '<p><a href="http://example.com">see &lt;!-- <em>bar</em>---&gt;</a></p>',
  );
  assertHtml(
    "foo\n    <!-- *bar*--->",
    "<p>foo\n&lt;!-- <em>bar</em>---&gt;</p>",
  );
});

test("accepted comments, HTML blocks, and code stay literal", () => {
  assertHtml(
    "foo <!-- *bar* -->",
    "<p>foo &lt;!-- *bar* --&gt;</p>",
  );
  assertHtml(
    "a <!-- *b*-----> c",
    "<p>a &lt;!-- *b*-----&gt; c</p>",
  );
  assertHtml(
    "foo <!-- *bar* -->\n---",
    "<h2>foo &lt;!-- *bar* --&gt;</h2>",
  );
  const block = renderReply("<!-- *bar*--->");
  assert.doesNotMatch(block, /<em>/);
  assert.match(block, /\*bar\*/);
  assert.doesNotMatch(block, /§§SBE/);

  const after = renderReply("foo\n<!-- *bar*--->");
  assert.match(after, /<p>foo<\/p>/);
  assert.doesNotMatch(after, /<em>/);
  assert.match(after, /\*bar\*/);

  const indented = renderReply("foo\n   <!-- *bar*--->");
  assert.doesNotMatch(indented, /<em>/);
  assert.match(indented, /\*bar\*/);

  assertHtml("see `<!-- *bar*--->` now", "<p>see <code>&lt;!-- *bar*---&gt;</code> now</p>");
  assertHtml(
    "```\n<!-- *bar*--->\n```",
    "<pre><code>&lt;!-- *bar*---&gt;\n</code></pre>",
  );
  assertHtml(
    "foo\n\n    <!-- *bar*--->",
    "<p>foo</p><pre><code>&lt;!-- *bar*---&gt;\n</code></pre>",
  );
  assert.equal(literalizeRawHtml("see <!-- *bar*--->", false), "see <!-- *bar*--->");
  const stashed = literalizeRawHtml("see <!-- *bar*--->", true);
  assert.match(stashed, /§§SBE00003C§§!--/);
  assert.equal(stashed.includes("<"), false);
});

test("both clients share the comment rule and the reply path", () => {
  assert.match(src, /v2\.03/);
  assert.match(src, /function cmarkHtmlCommentEnd/);
  assert.match(src, /function isInvalidHtmlComment/);
  assert.match(src, /function scanHtmlComment/);
  assert.match(src, /stashMarkdownText\("<"\)/);
  assert.match(swift, /v2\.03/);
  assert.match(swift, /func cmarkHtmlCommentEnd/);
  assert.match(swift, /func isInvalidHtmlComment/);
  assert.match(swift, /func scanHtmlComment/);
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
  assert.ok(roadmap.includes("/ v2.03 "));
  assert.match(spec, /## 203\. v2\.03/);
  assert.match(ci, /test_ios_markdown_comment_close\.py/);
  assert.match(pkg, /markdownCommentClose\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
