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

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"),
  "utf8",
);
const listSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
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
  "v1.97 cmark-gfm block quotes inside list items in completed assistant replies";

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

test("section 5.1 block quotes that already matched stay cmark-gfm HTML", () => {
  const examples: Array<[string, string]> = [
    [
      "> # Foo\n> bar\n> baz",
      "<blockquote><h1>Foo</h1><p>bar\nbaz</p></blockquote>",
    ],
    [
      "># Foo\n>bar\n> baz",
      "<blockquote><h1>Foo</h1><p>bar\nbaz</p></blockquote>",
    ],
    [
      "   > # Foo\n   > bar\n > baz",
      "<blockquote><h1>Foo</h1><p>bar\nbaz</p></blockquote>",
    ],
    [
      "    > # Foo\n    > bar\n    > baz",
      "<pre><code>&gt; # Foo\n&gt; bar\n&gt; baz\n</code></pre>",
    ],
    [
      "> # Foo\n> bar\nbaz",
      "<blockquote><h1>Foo</h1><p>bar\nbaz</p></blockquote>",
    ],
    [
      "> bar\nbaz\n> foo",
      "<blockquote><p>bar\nbaz\nfoo</p></blockquote>",
    ],
    ["> foo\n---", "<blockquote><p>foo</p></blockquote><hr />"],
    [
      "> - foo\n- bar",
      "<blockquote><ul><li>foo</li></ul></blockquote><ul><li>bar</li></ul>",
    ],
    [
      ">     foo\n    bar",
      "<blockquote><pre><code>foo\n</code></pre></blockquote><pre><code>bar\n</code></pre>",
    ],
    [
      "> ```\nfoo\n```",
      "<blockquote><pre><code></code></pre></blockquote><p>foo</p><pre><code></code></pre>",
    ],
    ["> foo\n    - bar", "<blockquote><p>foo\n- bar</p></blockquote>"],
    [">", "<blockquote></blockquote>"],
    [">\n>  \n> ", "<blockquote></blockquote>"],
    [">\n> foo\n>  ", "<blockquote><p>foo</p></blockquote>"],
    [
      "> foo\n\n> bar",
      "<blockquote><p>foo</p></blockquote><blockquote><p>bar</p></blockquote>",
    ],
    ["> foo\n> bar", "<blockquote><p>foo\nbar</p></blockquote>"],
    ["> foo\n>\n> bar", "<blockquote><p>foo</p><p>bar</p></blockquote>"],
    ["foo\n> bar", "<p>foo</p><blockquote><p>bar</p></blockquote>"],
    [
      "> aaa\n***\n> bbb",
      "<blockquote><p>aaa</p></blockquote><hr /><blockquote><p>bbb</p></blockquote>",
    ],
    ["> bar\nbaz", "<blockquote><p>bar\nbaz</p></blockquote>"],
    ["> bar\n\nbaz", "<blockquote><p>bar</p></blockquote><p>baz</p>"],
    ["> bar\n>\nbaz", "<blockquote><p>bar</p></blockquote><p>baz</p>"],
    [
      "> > > foo\nbar",
      "<blockquote><blockquote><blockquote><p>foo\nbar</p></blockquote></blockquote></blockquote>",
    ],
    [
      ">>> foo\n> bar\n>>baz",
      "<blockquote><blockquote><blockquote><p>foo\nbar\nbaz</p></blockquote></blockquote></blockquote>",
    ],
    [
      ">     code\n\n>    not code",
      "<blockquote><pre><code>code\n</code></pre></blockquote><blockquote><p>not code</p></blockquote>",
    ],
  ];
  for (const [markdown, html] of examples) assertHtml(markdown, html);
  assertHtml("> foo\nbar\n===", "<blockquote><p>foo\nbar\n===</p></blockquote>");
  assertHtml("> foo  \n> bar", "<blockquote><p>foo<br />\nbar</p></blockquote>");
  assertHtml("> foo  \nbar", "<blockquote><p>foo<br />\nbar</p></blockquote>");
  assertHtml("> foo\\\nbar", "<blockquote><p>foo<br />\nbar</p></blockquote>");
  assertHtml("- foo  \n  bar", "<ul><li>foo<br />\nbar</li></ul>");
  assertHtml("- foo\\\n  bar", "<ul><li>foo<br />\nbar</li></ul>");
});

test("a quote marker indented to a bullet item stays inside the item", () => {
  const kept = [
    "- foo\n  > bar",
    "- foo  \n  > bar",
    "* item\n  > quoted\n  still",
    "+ item\n   > quoted",
    "- foo\n   > bar",
    "- foo\n    > bar",
    "  - foo\n    > bar",
    "- foo\n  > bar\n- baz",
    "- foo\n\n  > bar\n\n- baz",
  ];
  for (const sample of kept) {
    const parts = splitQuoteAndTasks(sample, true);
    assert.equal(parts.length, 1, sample);
    assert.equal(parts[0]?.type, "markdown", sample);
  }

  assertHtml(
    "- foo\n  > bar",
    "<ul><li>foo\n<blockquote><p>bar</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo  \n  > bar",
    "<ul><li>foo\n<blockquote><p>bar</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo\n  > bar\n  baz",
    "<ul><li>foo\n<blockquote><p>bar\nbaz</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo\n  > bar\nbaz",
    "<ul><li>foo\n<blockquote><p>bar\nbaz</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo\n  > bar\n  > baz",
    "<ul><li>foo\n<blockquote><p>bar\nbaz</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo\n  > bar\n  > baz\nqux",
    "<ul><li>foo\n<blockquote><p>bar\nbaz\nqux</p></blockquote></li></ul>",
  );
  assertHtml(
    "* item\n  > quoted\n  still",
    "<ul><li>item\n<blockquote><p>quoted\nstill</p></blockquote></li></ul>",
  );
  assertHtml(
    "+ item\n   > quoted",
    "<ul><li>item\n<blockquote><p>quoted</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo\n\n  > bar",
    "<ul><li><p>foo</p><blockquote><p>bar</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo\n\n  > bar\n\n- baz",
    "<ul><li><p>foo</p><blockquote><p>bar</p></blockquote></li><li><p>baz</p></li></ul>",
  );
  assertHtml(
    "- foo\n  > bar\n- baz",
    "<ul><li>foo\n<blockquote><p>bar</p></blockquote></li><li>baz</li></ul>",
  );
  assertHtml(
    "- a\n  - b\n    > c",
    "<ul><li>a\n<ul><li>b\n<blockquote><p>c</p></blockquote></li></ul></li></ul>",
  );
  assertHtml(
    "1. foo\n   > bar",
    "<ol><li>foo\n<blockquote><p>bar</p></blockquote></li></ol>",
  );
  assertHtml(
    "> - foo\n>   > bar",
    "<blockquote><ul><li>foo\n<blockquote><p>bar</p></blockquote></li></ul></blockquote>",
  );
  assertHtml(
    "* foo\n\n  > bar\n  baz",
    "<ul><li><p>foo</p><blockquote><p>bar\nbaz</p></blockquote></li></ul>",
  );
});

test("a hard break inside that quote stays in the item", () => {
  assertHtml(
    "- foo\n  > bar  \n  baz",
    "<ul><li>foo\n<blockquote><p>bar<br />\nbaz</p></blockquote></li></ul>",
  );
  assertHtml(
    "- foo\n  > bar\\\n  baz",
    "<ul><li>foo\n<blockquote><p>bar<br />\nbaz</p></blockquote></li></ul>",
  );
  assertHtml(
    "> - foo\n>   > bar  \n>   baz",
    "<blockquote><ul><li>foo\n<blockquote><p>bar<br />\nbaz</p></blockquote></li></ul></blockquote>",
  );
});

test("a quote short of the item column still follows the list", () => {
  assertHtml(
    "- foo\n > bar",
    "<ul><li>foo</li></ul><blockquote><p>bar</p></blockquote>",
  );
  assertHtml(
    "- foo\n> bar",
    "<ul><li>foo</li></ul><blockquote><p>bar</p></blockquote>",
  );
  const parts = splitQuoteAndTasks("- foo\n> bar", true);
  assert.equal(parts[0]?.type, "markdown");
  assert.equal(parts[1]?.type, "quote");
  assert.equal(parts[1]?.type === "quote" ? parts[1].text : "", "bar");
});

test("a task item keeps the indented quote in its text", () => {
  const parts = splitQuoteAndTasks("- [ ] foo\n  > bar", true);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "tasks");
  if (parts[0]?.type !== "tasks") return;
  assert.equal(parts[0].items[0]?.text, "foo\n> bar");
  assert.equal(parts[0].items[0]?.checked, false);
  assertHtml(
    "foo\n> bar",
    "<p>foo</p><blockquote><p>bar</p></blockquote>",
  );
  const checked = splitQuoteAndTasks("- [x] done\n  > note\n  more", true);
  assert.equal(checked[0]?.type, "tasks");
  if (checked[0]?.type !== "tasks") return;
  assert.equal(checked[0].items[0]?.checked, true);
  assert.equal(checked[0].items[0]?.text, "done\n> note\nmore");
});

test("streaming stays the markdown string", () => {
  const live = "- foo\n  > bar\n";
  assert.deepEqual(splitQuoteAndTasks(live, false), [{ type: "markdown", text: live }]);
});

test("v1.97 stays on OpenAPI 0.18.0 and does not copy or stream the split", () => {
  assert.match(src, /v1\.97/);
  assert.match(src, /function quoteOwnedByList/);
  assert.match(src, /markdownListEnd/);
  assert.match(swift, /v1\.97/);
  assert.match(swift, /func quoteOwnedByList/);
  assert.match(swift, /MarkdownList\.listEnd/);
  assert.match(listSwift, /static func listEnd/);
  assert.match(markdown, /MarkdownQuoteTask\.split\(/);
  assert.match(body, /splitQuoteAndTasks\(protectLazySetext\(text, completed\), completed\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /clipboard|copyText|\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard|withAnimation|computerPane|\/v1\//);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v1.97 "));
  assert.match(spec, /## 197\. v1\.97/);
  assert.match(spec, /block quotes inside list items/i);
  assert.match(ci, /test_ios_markdown_quote_list\.py/);
  assert.match(pkg, /markdownQuoteList\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
