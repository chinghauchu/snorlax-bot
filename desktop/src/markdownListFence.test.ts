// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
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
import { extractMath, fenceRanges } from "./math.ts";
import { splitMarkdownLists, type ListBlock } from "./markdownList.ts";
import { shouldRenderMarkdown } from "./midStreamPlaintext.ts";

const here = dirname(fileURLToPath(import.meta.url));
const mathSrc = readFileSync(join(here, "math.ts"), "utf8");
const markdownSrc = readFileSync(join(here, "markdown.ts"), "utf8");
const lists = readFileSync(join(here, "markdownList.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const bubbles = readFileSync(join(here, "assistantBubbles.ts"), "utf8");
const codeSpan = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownCodeSpan.swift"),
  "utf8",
);
const listSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
  "utf8",
);
const markdownSwift = readFileSync(
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
  "v1.98 cmark-gfm fenced code that is a list item in completed assistant replies";

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

test("a list item's fence stays one code block when the closer is in the first three columns", () => {
  const bullet = "- ```\n  foo\n  ```\n";
  assert.equal(stabilizeMarkdown(bullet), bullet);
  assert.deepEqual(fenceRanges(bullet), [{ start: 0, end: bullet.lastIndexOf("\n") }]);
  assert.deepEqual(listAt(splitMarkdownLists(bullet, true)).items, ["```\nfoo\n```"]);
  assertHtml(bullet, "<ul><li><pre><code>foo\n</code></pre></li></ul>");
  assert.equal(renderReply(bullet).split("<pre>").length - 1, 1);

  const after = "- ```\n  foo\n  ```\n\nafter\n";
  assert.equal(stabilizeMarkdown(after), after);
  assert.deepEqual(splitAssistantBubbles(after, true), ["- ```\n  foo\n  ```", "after"]);
  assertHtml(
    after,
    "<ul><li><pre><code>foo\n</code></pre></li></ul><p>after</p>",
  );

  assertHtml(
    "- a\n- ```\n  b\n\n\n  ```\n- c\n",
    "<ul><li>a</li><li><pre><code>b\n\n\n</code></pre></li><li>c</li></ul>",
  );
  assert.deepEqual(listAt(splitMarkdownLists("- a\n- ```\n  b\n\n\n  ```\n- c", true)).items, [
    "a",
    "```\nb\n\n\n```",
    "c",
  ]);

  assertHtml(
    "1. ```\n   foo\n   ```\n\n   bar\n",
    "<ol><li><pre><code>foo\n</code></pre><p>bar</p></li></ol>",
  );
  assert.deepEqual(splitAssistantBubbles("1. ```\n   foo\n   ```\n\n   bar", true), [
    "1. ```\n   foo\n   ```\n\n   bar",
  ]);
  assert.deepEqual(listAt(splitMarkdownLists("1. ```\n   foo\n   ```\n\n   bar", true)).items, [
    "```\nfoo\n```\n\nbar",
  ]);

  for (const sample of ["* ```\n  foo\n  ```\n", "+ ```\n  foo\n  ```\n", "   - ```\n     foo\n     ```\n"]) {
    assert.equal(stabilizeMarkdown(sample), sample);
    assertHtml(sample, "<ul><li><pre><code>foo\n</code></pre></li></ul>");
  }
  assertHtml("1) ```\n   foo\n   ```\n", "<ol><li><pre><code>foo\n</code></pre></li></ol>");
  assertHtml("- ~~~\n  foo\n  ~~~\n", "<ul><li><pre><code>foo\n</code></pre></li></ul>");
  assertHtml(
    "- ```js\n  foo\n  ```\n",
    '<ul><li><pre><code class="language-js">foo\n</code></pre></li></ul>',
  );
  assertHtml(
    "- ``` extra\n  foo\n  ```\n",
    '<ul><li><pre><code class="language-extra">foo\n</code></pre></li></ul>',
  );

  const kept = "- ```\n  foo\n  ``` extra\n";
  assert.equal(stabilizeMarkdown(kept), kept);
  assertHtml(kept, "<ul><li><pre><code>foo\n``` extra\n</code></pre></li></ul>");
});

test("a line that ends the item is not swallowed, and a real top fence still closes", () => {
  const ended = "- ```\nfoo\n";
  assert.equal(stabilizeMarkdown(ended), ended);
  assert.deepEqual(fenceRanges(ended), [{ start: 0, end: 6 }]);
  assert.deepEqual(listAt(splitMarkdownLists(ended, true)).items, ["```"]);
  assertHtml(ended, "<ul><li><pre><code></code></pre></li></ul><p>foo</p>");

  const nextFence = "- ```\n  foo\n```\nbar\n";
  assert.equal(stabilizeMarkdown(nextFence), "- ```\n  foo\n```\nbar\n```");
  assertHtml(
    nextFence,
    "<ul><li><pre><code>foo\n</code></pre></li></ul><pre><code>bar\n</code></pre>",
  );

  const open = "```\nok";
  assert.equal(stabilizeMarkdown(open), "```\nok\n```");
  assert.deepEqual(fenceRanges(open), [{ start: 0, end: open.length }]);
  assert.deepEqual(fenceRanges("``` `` ```"), []);
  assertHtml("``` `` ```", "<p><code>``</code></p>");

  const quoted = "> - ```\n>   foo\n>   ```\n";
  assert.equal(stabilizeMarkdown(quoted), quoted);
  assertHtml(
    quoted,
    "<blockquote><ul><li><pre><code>foo\n</code></pre></li></ul></blockquote>",
  );
});

test("escapes and hard breaks inside the list fence stay literal", () => {
  const escaped = "- ```\n  \\*star\\*\n  ```\n";
  assert.equal(protectMarkdownEscapes(escaped, true).includes("§§SBE"), false);
  assertHtml(escaped, "<ul><li><pre><code>\\*star\\*\n</code></pre></li></ul>");

  const broken = "- ```\n  foo  \n  bar\n  ```\n";
  assert.equal(applyHardLineBreaks(broken, true).includes(HARD_BREAK_TOKEN), false);
  assertHtml(broken, "<ul><li><pre><code>foo  \nbar\n</code></pre></li></ul>");

  const blankInside = "- ```\n  foo\n\n  bar\n  ```\n";
  assert.equal(stabilizeMarkdown(blankInside), blankInside);
  assert.deepEqual(splitAssistantBubbles(blankInside, true), [blankInside.trimEnd()]);
  assertHtml(blankInside, "<ul><li><pre><code>foo\n\nbar\n</code></pre></li></ul>");
});

test("v1.98 stays on OpenAPI 0.18.0 and does not copy or stream the split", () => {
  assert.equal(shouldRenderMarkdown({ completed: false }), false);
  assert.equal(shouldRenderMarkdown({ completed: true }), true);
  assert.match(mathSrc, /stepDocumentFence/);
  assert.match(mathSrc, /listMarkerFence/);
  assert.match(markdownSrc, /stepDocumentFence/);
  assert.match(markdownSrc, /if \(!state\.top\) return src/);
  assert.match(lists, /the item text itself may be the opening fence/);
  assert.match(lists, /openingFence\(marker\.text\)/);
  assert.match(codeSpan, /static func step/);
  assert.match(codeSpan, /listMarkerFence/);
  assert.match(listSwift, /the item text itself may be the opening fence/);
  assert.match(listSwift, /fenceOnLine\(marker\.text\)/);
  assert.match(markdownSwift, /MarkdownCodeSpan\.step/);
  assert.match(markdownSwift, /a fence that belongs to a list item is not a segment/);
  assert.match(body, /stabilizeMarkdown/);
  assert.match(bubbles, /markdownListEnd/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /withAnimation/);
  assert.doesNotMatch(mathSrc, /\/v1\//);
  assert.doesNotMatch(codeSpan, /UIPasteboard/);
  assert.doesNotMatch(codeSpan, /withAnimation/);
  assert.doesNotMatch(codeSpan, /computerPane/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v1.98 "));
  assert.match(spec, /## 198\. v1\.98/);
  assert.match(ci, /test_ios_markdown_list_fence\.py/);
  assert.match(pkg, /markdownListFence\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
