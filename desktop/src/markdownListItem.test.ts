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
import { splitIndentedCode } from "./markdownIndentedCode.ts";
import {
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import {
  applyHardLineBreaks,
  HARD_BREAK_TOKEN,
  remarkHardBreaks,
} from "./markdownHardBreak.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";
import { remarkOrderedTaskMarkers } from "./markdownOrderedTask.ts";
import { prepareAngleAutolinks } from "./markdownAutolink.ts";
import { prepareLinkDestinations } from "./markdownLinkDest.ts";
import { prepareSpacedLinkDestinations } from "./markdownReferenceLink.ts";
import { prepareLinkTitleForms } from "./markdownLinkTitle.ts";
import { prepareImageAlts } from "./markdownImageAlt.ts";
import { neutralizeUnsafeImages } from "./markdownImage.ts";
import { extractMath } from "./math.ts";
import { splitMarkdownLists, type ListBlock } from "./markdownList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownHardBreak.ts"), "utf8");
const lists = readFileSync(join(here, "markdownList.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownHardBreak.swift"),
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

const PHRASE = "v1.96 cmark-gfm list items in completed assistant replies";

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
    .replaceAll("<br/>", "<br />")
    .replaceAll("<br>", "<br />")
    .replace(/>\s+</g, "><")
    .trim();
}

function paintPrepared(text: string, stripParagraph: boolean): string {
  const prepared = prepareLinkTitleForms(
    prepareImageAlts(
      prepareSpacedLinkDestinations(prepareLinkDestinations(text, true), true),
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

function listAt(blocks: ListBlock[]) {
  const list = blocks.find((block) => block.type === "list");
  assert.ok(list && list.type === "list");
  return list.list;
}

test("section 5.2 cases that already matched stay cmark-gfm HTML", () => {
  assertHtml(
    "-\n  foo\n-\n  ```\n  bar\n  ```\n-\n      baz",
    "<ul><li>foo</li><li><pre><code>bar\n</code></pre></li><li><pre><code>baz\n</code></pre></li></ul>",
  );
  assertHtml("-\n\n  foo", "<ul><li></li></ul><p>foo</p>");
  assertHtml("- foo\n-\n- bar", "<ul><li>foo</li><li></li><li>bar</li></ul>");
  assertHtml("- foo\n-   \n- bar", "<ul><li>foo</li><li></li><li>bar</li></ul>");
  assertHtml("1. foo\n2.\n3. bar", "<ol><li>foo</li><li></li><li>bar</li></ol>");
  assertHtml("*", "<ul><li></li></ul>");
  assertHtml("foo\n*\n\nfoo\n1.", "<p>foo\n*</p><p>foo\n1.</p>");
  assertHtml("- - foo", "<ul><li><ul><li>foo</li></ul></li></ul>");
  assertHtml(
    "1. - 2. foo",
    '<ol><li><ul><li><ol start="2"><li>foo</li></ol></li></ul></li></ol>',
  );
  assertHtml("- -", "<ul><li><ul><li></li></ul></li></ul>");
  assertHtml(
    "1. - 2.",
    '<ol><li><ul><li><ol start="2"><li></li></ol></li></ul></li></ol>',
  );
  assertHtml("- - -", "<hr />");
  assertHtml('123456789. ok', '<ol start="123456789"><li>ok</li></ol>');
  assertHtml("1234567890. not ok", "<p>1234567890. not ok</p>");
  assertHtml('0. ok', '<ol start="0"><li>ok</li></ol>');
  assertHtml('003. ok', '<ol start="3"><li>ok</li></ol>');
  assertHtml("-1. not ok", "<p>-1. not ok</p>");
  assertHtml("Foo\n9. bar", "<p>Foo\n9. bar</p>");
  assertHtml("Foo\n0. bar", "<p>Foo\n0. bar</p>");
  assertHtml(
    "1.     indented code\n\n   paragraph\n\n       more code",
    "<ol><li><pre><code>indented code\n</code></pre><p>paragraph</p><pre><code>more code\n</code></pre></li></ol>",
  );
  assertHtml(
    "1.      indented code\n\n   paragraph\n\n       more code",
    "<ol><li><pre><code> indented code\n</code></pre><p>paragraph</p><pre><code>more code\n</code></pre></li></ol>",
  );
  assertHtml("-    foo\n\n  bar", "<ul><li>foo</li></ul><p>bar</p>");
  assertHtml("-  foo\n\n   bar", "<ul><li><p>foo</p><p>bar</p></li></ul>");
  assertHtml("- foo  \n  bar", "<ul><li>foo<br />\nbar</li></ul>");
  assertHtml("- foo\\\n  bar", "<ul><li>foo<br />\nbar</li></ul>");
  assertHtml("- foo  \n- bar", "<ul><li>foo</li><li>bar</li></ul>");
  assertHtml("- foo\\\n", "<ul><li>foo\\</li></ul>");
  assertHtml("> foo  \n> bar", "<blockquote><p>foo<br />\nbar</p></blockquote>");
  assertHtml("> foo  \n>\n> bar", "<blockquote><p>foo</p><p>bar</p></blockquote>");
  assertHtml("foo\\\n", "<p>foo\\</p>");

  const nested = listAt(splitMarkdownLists("- - foo", true));
  assert.deepEqual(nested.items, ["- foo"]);
  assert.deepEqual(listAt(splitMarkdownLists(nested.items[0] ?? "", true)).items, ["foo"]);
  const ordered = listAt(splitMarkdownLists("1. - 2. foo", true));
  assert.equal(ordered.start, 1);
  assert.deepEqual(ordered.items, ["- 2. foo"]);
  const middle = listAt(splitMarkdownLists(ordered.items[0] ?? "", true));
  assert.deepEqual(middle.items, ["2. foo"]);
  assert.equal(listAt(splitMarkdownLists(middle.items[0] ?? "", true)).start, 2);
  assert.deepEqual(listAt(splitMarkdownLists("- foo\n-\n- bar", true)).items, ["foo", "", "bar"]);
  assert.equal(splitMarkdownLists("foo\n*\n\nfoo\n1.", true).some((block) => block.type === "list"), false);
  assert.equal(splitMarkdownLists("1234567890. not ok", true)[0]?.type, "markdown");
  assert.equal(listAt(splitMarkdownLists("003. ok", true)).start, 3);
  assert.equal(listAt(splitMarkdownLists("0. ok", true)).start, 0);
});

test("a blank marker's padding spaces are not a hard break", () => {
  const bullets = [
    "-   \n  foo",
    "-  \n  foo",
    "-    \n    foo",
    "-     \n     foo",
    "*   \n  foo",
    "+   \n  foo",
    "   -   \n     foo",
    "*\t\n  foo",
  ];
  for (const sample of bullets) {
    assert.equal(applyHardLineBreaks(sample, true).includes(HARD_BREAK_TOKEN), false, sample);
    assertHtml(sample, "<ul><li>foo</li></ul>");
  }
  const ordered: Array<[string, string]> = [
    ["1.   \n   foo", "<ol><li>foo</li></ol>"],
    ["10.   \n    bar", '<ol start="10"><li>bar</li></ol>'],
    ["0.   \n   ok", '<ol start="0"><li>ok</li></ol>'],
    ["003.   \n     ok", '<ol start="3"><li>ok</li></ol>'],
  ];
  for (const [sample, html] of ordered) {
    assert.equal(applyHardLineBreaks(sample, true).includes(HARD_BREAK_TOKEN), false, sample);
    assertHtml(sample, html);
  }

  assertHtml("-   \n  foo", "<ul><li>foo</li></ul>");
  assertHtml("> -   \n>   foo", "<blockquote><ul><li>foo</li></ul></blockquote>");
  assertHtml("> > -   \n> >   foo", "<blockquote><blockquote><ul><li>foo</li></ul></blockquote></blockquote>");
  assertHtml("foo\n-   \n  bar", "<h2>foo</h2><p>bar</p>");
  assert.equal(applyHardLineBreaks("foo\n-   \n  bar", true).includes(HARD_BREAK_TOKEN), false);
  assert.equal(applyHardLineBreaks("-   \n  foo", false), "-   \n  foo");

  assert.deepEqual(listAt(splitMarkdownLists("-   \n  foo", true)).items, ["foo"]);
  assert.deepEqual(listAt(splitMarkdownLists("1.   \n   foo", true)).items, ["foo"]);
  const quoted = splitQuoteAndTasks("> -   \n>   foo", true);
  assert.equal(quoted[0]?.type, "quote");
  if (quoted[0]?.type === "quote") {
    assert.deepEqual(listAt(splitMarkdownLists(quoted[0].text, true)).items, ["foo"]);
  }

  assertHtml(
    "1.     code  \n   more",
    "<ol><li><pre><code>code  \n</code></pre>\nmore</li></ol>",
  );
  assert.equal(applyHardLineBreaks("1.     code  \n   more", true).includes(HARD_BREAK_TOKEN), false);
  assertHtml(
    "-       bar  \n  baz",
    "<ul><li><pre><code>  bar  \n</code></pre>\nbaz</li></ul>",
  );
  const codeItem = listAt(splitMarkdownLists("1.     code  \n   more", true)).items[0] ?? "";
  const code = splitIndentedCode(codeItem, true).find((part) => part.type === "code");
  assert.equal(code?.type === "code" ? code.source : "", "code  ");

  assertHtml("- foo  \n  bar", "<ul><li>foo<br />\nbar</li></ul>");
  assertHtml("- foo  \n      bar", "<ul><li>foo<br />\nbar</li></ul>");
  assert.match(applyHardLineBreaks("- foo  \n  bar", true), new RegExp(HARD_BREAK_TOKEN));
});

test("v1.96 stays on OpenAPI 0.18.0 and does not copy or stream the split", () => {
  assert.match(src, /v1\.96/);
  assert.match(src, /remainderOpensParagraph/);
  assert.match(src, /listMarkerPadding/);
  assert.match(swift, /v1\.96/);
  assert.match(swift, /remainderOpensParagraph/);
  assert.match(swift, /MarkdownList\.listMarkerPadding/);
  assert.match(listSwift, /A blank marker line uses one/);
  assert.match(lists, /A blank marker line uses one/);
  assert.match(body, /applyHardLineBreaks/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /applyHardLineBreaks\(reply/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v1.96 "));
  assert.match(spec, /## 196\. v1\.96/);
  assert.match(ci, /test_ios_markdown_list_item\.py/);
  assert.match(pkg, /markdownListItem\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
