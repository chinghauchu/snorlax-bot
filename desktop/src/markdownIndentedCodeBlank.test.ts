// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { stabilizeMarkdown } from "./markdown.ts";
import { splitMarkdownTables } from "./markdownTable.ts";
import {
  headingInlineSource,
  protectLazySetext,
  splitSetextHeadings,
} from "./markdownSetext.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { remarkStrikethrough, splitThematicBreaks } from "./markdownBreak.ts";
import {
  dedentCodeLine,
  splitIndentedCode,
} from "./markdownIndentedCode.ts";
import {
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";
import { remarkOrderedTaskMarkers } from "./markdownOrderedTask.ts";
import { prepareAngleAutolinks } from "./markdownAutolink.ts";
import { prepareLinkDestinations } from "./markdownLinkDest.ts";
import { prepareSpacedLinkDestinations } from "./markdownReferenceLink.ts";
import { prepareLinkTitleForms } from "./markdownLinkTitle.ts";
import { prepareImageAlts } from "./markdownImageAlt.ts";
import { neutralizeUnsafeImages } from "./markdownImage.ts";
import { extractMath } from "./math.ts";
import { splitMarkdownLists } from "./markdownList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownIndentedCode.ts"), "utf8");
const lists = readFileSync(join(here, "markdownList.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownIndentedCode.swift"),
  "utf8",
);
const listSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
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
  "v1.95 cmark-gfm indented code blocks in completed assistant replies";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function norm(html: string): string {
  return html
    .replaceAll("<hr/>", "<hr />")
    .replaceAll("<hr>", "<hr />")
    .replace(/>\s+</g, "><")
    .trim();
}

/** Same inline prepare order a completed reply uses. */
function paintPrepared(text: string, stripParagraph: boolean): string {
  const prepared = prepareLinkTitleForms(
    prepareImageAlts(
      prepareSpacedLinkDestinations(
        prepareLinkDestinations(text, true),
        true,
      ),
      true,
    ),
    true,
  );
  const extracted = extractMath(prepared);
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, true),
    true,
  );
  const source = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(mathText, true), true),
      true,
    ),
    true,
  );
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkOrderedTaskMarkers, remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: source,
    }),
  );
  const restored = restoreMarkdownEscapes(html);
  return stripParagraph ? restored.replace(/<\/?p>/g, "") : restored;
}

function codeHtml(source: string): string {
  const text = source.endsWith("\n") ? source : `${source}\n`;
  return `<pre><code>${escapeHtml(text)}</code></pre>`;
}

/**
 * Setext, thematic breaks, indented code, then the remark plugins.
 * The same order `MarkdownBody` uses for a completed assistant reply.
 */
function renderChunk(text: string): string {
  const out: string[] = [];
  for (const part of splitSetextHeadings(text, true)) {
    if (part.type === "heading") {
      const tag = part.level === 1 ? "h1" : "h2";
      out.push(`<${tag}>${paintPrepared(headingInlineSource(part.text), true)}</${tag}>`);
      continue;
    }
    for (const br of splitThematicBreaks(part.text, true)) {
      if (br.type === "rule") {
        out.push("<hr />");
        continue;
      }
      for (const code of splitIndentedCode(br.text, true)) {
        if (code.type === "code") out.push(codeHtml(code.source));
        else out.push(paintPrepared(code.text, false));
      }
    }
  }
  return out.join("\n");
}

function renderReply(text: string): string {
  const stable = stabilizeMarkdown(text);
  const out: string[] = [];
  for (const segment of splitMarkdownTables(stable, true)) {
    if (segment.type === "table") {
      out.push("[[TABLE]]");
      continue;
    }
    for (const block of splitQuoteAndTasks(protectLazySetext(segment.text, true), true)) {
      if (block.type === "quote") {
        out.push(`<blockquote>\n${renderReply(block.text)}\n</blockquote>`);
      } else if (block.type === "tasks") {
        out.push("[[TASKS]]");
      } else {
        out.push(renderChunk(block.text));
      }
    }
  }
  return out.join("\n");
}

function assertHtml(markdown: string, html: string): void {
  assert.equal(norm(renderReply(markdown)), norm(html), JSON.stringify(markdown));
}

test("section 4.4 examples that already matched stay cmark-gfm HTML", () => {
  assertHtml(
    "    a simple\n      indented code block",
    "<pre><code>a simple\n  indented code block\n</code></pre>",
  );
  assertHtml(
    "  - foo\n\n    bar",
    "<ul>\n<li>\n<p>foo</p>\n<p>bar</p>\n</li>\n</ul>",
  );
  assertHtml(
    "1.  foo\n\n    - bar",
    "<ol>\n<li>\n<p>foo</p>\n<ul>\n<li>bar</li>\n</ul>\n</li>\n</ol>",
  );
  assertHtml(
    "    <a/>\n    *hi*\n\n    - one",
    "<pre><code>&lt;a/&gt;\n*hi*\n\n- one\n</code></pre>",
  );
  assertHtml(
    "    chunk1\n\n    chunk2\n  \n \n \n    chunk3",
    "<pre><code>chunk1\n\nchunk2\n\n\n\nchunk3\n</code></pre>",
  );
  assertHtml("Foo\n    bar\n", "<p>Foo\nbar</p>");
  assertHtml(
    "    foo\nbar",
    "<pre><code>foo\n</code></pre>\n<p>bar</p>",
  );
  assertHtml(
    "# Heading\n    foo\nHeading\n------\n    foo\n----",
    "<h1>Heading</h1>\n<pre><code>foo\n</code></pre>\n<h2>Heading</h2>\n<pre><code>foo\n</code></pre>\n<hr />",
  );
  assertHtml(
    "        foo\n    bar",
    "<pre><code>    foo\nbar\n</code></pre>",
  );
  assertHtml("\n    \n    foo\n    \n", "<pre><code>foo\n</code></pre>");
  assertHtml("    foo  ", "<pre><code>foo  \n</code></pre>");
  assertHtml("\tfoo\tbaz\t\tbim", "<pre><code>foo\tbaz\t\tbim\n</code></pre>");
  assertHtml("  \tfoo\tbaz\t\tbim", "<pre><code>foo\tbaz\t\tbim\n</code></pre>");
  assertHtml("    foo\n\tbar", "<pre><code>foo\nbar\n</code></pre>");
  assertHtml(
    "    ```\n    aaa\n    ```",
    "<pre><code>```\naaa\n```\n</code></pre>",
  );
  assertHtml(
    "```\ncode\n```\n    foo",
    "<pre><code>code\n</code></pre>\n<pre><code>foo\n</code></pre>",
  );
  assertHtml(
    ">\t\tfoo",
    "<blockquote>\n<pre><code>  foo\n</code></pre>\n</blockquote>",
  );
  assert.equal(splitIndentedCode("    hidden\n", false)[0]?.type, "markdown");
});

test("interior blank lines keep columns past the fourth", () => {
  assert.equal(dedentCodeLine("      "), "  ");
  assert.equal(dedentCodeLine("\t\t"), "\t");
  assert.equal(dedentCodeLine(" \t "), " ");
  assert.equal(dedentCodeLine("    \t"), "\t");
  assert.equal(dedentCodeLine("    "), "");
  assert.equal(dedentCodeLine(""), "");
  assert.equal(dedentCodeLine("     "), " ");

  assertHtml(
    "    chunk1\n      \n      chunk2",
    "<pre><code>chunk1\n  \n  chunk2\n</code></pre>",
  );
  assertHtml(
    "    foo\n\t\t\n    bar",
    "<pre><code>foo\n\t\nbar\n</code></pre>",
  );
  assertHtml(
    "    foo\n \t \n    bar",
    "<pre><code>foo\n \nbar\n</code></pre>",
  );
  assertHtml(
    "    foo\n    \t\n    bar",
    "<pre><code>foo\n\t\nbar\n</code></pre>",
  );
  assertHtml("    foo\n      \n", "<pre><code>foo\n</code></pre>");
  assertHtml("\n      \n    foo", "<pre><code>foo\n</code></pre>");
  assertHtml(
    "    chunk1\n\n      \n \n    chunk2",
    "<pre><code>chunk1\n\n  \n\nchunk2\n</code></pre>",
  );

  const item = "- foo\n\n      chunk1\n        \n      chunk2";
  assertHtml(
    item,
    "<ul>\n<li>\n<p>foo</p>\n<pre><code>chunk1\n  \nchunk2\n</code></pre>\n</li>\n</ul>",
  );
  const stored = splitMarkdownLists(item, true);
  assert.equal(stored[0]?.type, "list");
  const text = stored[0]?.type === "list" ? stored[0].list.items[0] : "";
  assert.equal(text, "foo\n\n    chunk1\n      \n    chunk2");
  const inner = splitIndentedCode(text ?? "", true);
  const code = inner.find((part) => part.type === "code");
  assert.equal(code?.type === "code" ? code.source : "", "chunk1\n  \nchunk2");

  const tabbed = "- foo\n\n\t\tchunk1\n\t\t\t\n\t\tchunk2";
  const tabHtml = renderReply(tabbed);
  const tabStored = splitMarkdownLists(tabbed, true);
  const tabText = tabStored[0]?.type === "list" ? tabStored[0].list.items[0] : "";
  const tabCode = splitIndentedCode(tabText ?? "", true).find((part) => part.type === "code");
  const fromHtml = /<pre><code>([\s\S]*?)<\/code><\/pre>/.exec(tabHtml)?.[1] ?? "";
  const decoded = fromHtml
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/\n$/, "");
  assert.equal(tabCode?.type === "code" ? tabCode.source : "", decoded);
  assert.match(decoded, /chunk1/);
  assert.match(tabHtml, /<p>foo<\/p>/);
});

test("v1.95 stays on OpenAPI 0.18.0 and does not copy or stream the split", () => {
  assert.match(src, /v1\.95/);
  assert.match(src, /dedentCodeLine\(lines\[i\]/);
  assert.doesNotMatch(src, /if \(isBlank\(line\)\) return "";/);
  assert.match(lists, /v1\.95/);
  assert.match(lists, /inIndentedCode/);
  assert.match(swift, /v1\.95/);
  assert.match(swift, /dedentCodeLine\(lines\[index\]\)/);
  assert.doesNotMatch(swift, /if isBlank\(line\) \{ return "" \}/);
  assert.match(listSwift, /v1\.95/);
  assert.match(listSwift, /inIndentedCode/);
  assert.match(body, /splitIndentedCode\(text, completed\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /splitIndentedCode\(reply/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v1.95 "));
  assert.match(spec, /## 195\. v1\.95/);
  assert.match(ci, /test_ios_markdown_indented_code_blank\.py/);
  assert.match(pkg, /markdownIndentedCodeBlank\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
