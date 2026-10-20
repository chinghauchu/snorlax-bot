// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { safeLinkHref } from "./markdownAutolink.ts";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import {
  inlineLinks,
  linkTitleAnimates,
  linkTitleHint,
  renderedInlineLinks,
} from "./markdownLinkTitle.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { splitMarkdownTables } from "./markdownTable.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownLinkTitle.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const plain = readFileSync(join(here, "midStreamPlaintext.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLinkTitle.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const preview = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "LinkPreview.swift"),
  "utf8",
);
const quote = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSelection.swift"),
  "utf8",
);
const mid = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MidStreamPlaintext.swift"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(join(here, "..", "..", "runtime", "openapi.yaml"), "utf8");

const PHRASE = "v1.46 CommonMark link titles in completed assistant replies";

function renderCompleted(text: string, completed = true): string {
  const source = applyHardLineBreaks(protectMarkdownEscapes(text, completed), completed);
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      urlTransform: (url: string) => url,
      components: {
        a: ({
          href,
          title,
          children,
        }: {
          href?: string;
          title?: string;
          children?: React.ReactNode;
        }) => {
          const url = safeLinkHref(restoreMarkdownEscapes(href ?? ""));
          const hint = linkTitleHint(title, completed && url.length > 0);
          if (!url) return React.createElement(React.Fragment, null, children);
          return React.createElement(
            "a",
            {
              href: url,
              className: "md-link",
              title: hint || undefined,
              "aria-description": hint || undefined,
            },
            children,
          );
        },
      },
      children: source,
    }),
  );
}

test("a title collapses whitespace and stays empty while streaming", () => {
  assert.equal(linkTitleHint("API reference"), "API reference");
  assert.equal(linkTitleHint("  hi \n there  "), "hi there");
  assert.equal(linkTitleHint("   "), "");
  assert.equal(linkTitleHint(""), "");
  assert.equal(linkTitleHint(null), "");
  assert.equal(linkTitleHint(undefined), "");
  assert.equal(linkTitleHint("API reference", false), "");
  assert.equal(linkTitleAnimates(false), false);
  assert.equal(linkTitleAnimates(true), false);
});

test("inline links keep double, single, and paren titles", () => {
  const sample = [
    '[docs](https://example.com/a "API reference")',
    "[src](https://example.com/b 'source')",
    "[paren](https://example.com/c (paren tip))",
    "[plain](https://example.com/d)",
    '[blank](https://example.com/e "")',
    '[spaces](https://example.com/f "   ")',
  ].join(" ");
  const links = renderedInlineLinks(sample);
  assert.deepEqual(
    links.map((link) => [link.label, link.title]),
    [
      ["docs", "API reference"],
      ["src", "source"],
      ["paren", "paren tip"],
      ["plain", null],
      ["blank", null],
      ["spaces", null],
    ],
  );
  const quoted = inlineLinks('[docs](https://example.com/a "say \\"hi\\"")');
  assert.equal(quoted[0]?.title, 'say "hi"');
  const entity = inlineLinks('[docs](https://example.com/a "A &amp; B")');
  assert.equal(entity[0]?.title, "A & B");
  const mail = renderedInlineLinks('[mail](mailto:user@example.com "Email me")');
  assert.equal(mail[0]?.title, "Email me");
  assert.equal(mail[0]?.dest, "mailto:user@example.com");
  assert.equal(renderedInlineLinks('[bad](javascript:alert(1) "xss")').length, 0);
  assert.equal(inlineLinks('[bad](javascript:alert(1) "xss")')[0]?.title, "xss");
});

test("titles inside code, math, images, and escapes stay out of the link list", () => {
  const fence = '```\n[docs](https://example.com/a "nope")\n```\n\n[real](https://example.com/b "yes")';
  assert.deepEqual(
    renderedInlineLinks(fence).map((link) => link.title),
    ["yes"],
  );
  const span = 'code `[docs](https://example.com/a "nope")` and [real](https://example.com/b "yes")';
  assert.deepEqual(
    renderedInlineLinks(span).map((link) => link.label),
    ["real"],
  );
  const indented = '    [docs](https://example.com/a "nope")\n\n[real](https://example.com/b "yes")';
  assert.deepEqual(
    renderedInlineLinks(indented).map((link) => link.title),
    ["yes"],
  );
  const math = '\\( [docs](https://example.com/a "nope") \\)\n\n[real](https://example.com/b "yes")';
  assert.deepEqual(
    renderedInlineLinks(math).map((link) => link.title),
    ["yes"],
  );
  const image = '![alt](https://example.com/a.png "diagram") and [docs](https://example.com/b "yes")';
  assert.deepEqual(
    renderedInlineLinks(image).map((link) => link.label),
    ["docs"],
  );
  assert.equal(inlineLinks('\\[docs](https://example.com/a "nope")').length, 0);
  const angled = '[docs](<https://example.com/a> "API reference")';
  assert.equal(renderedInlineLinks(angled)[0]?.title, "API reference");
  assert.equal(renderedInlineLinks(angled)[0]?.dest, "https://example.com/a");
});

test("a completed reply shows the title as tooltip and accessibility hint", () => {
  const html = renderCompleted('[docs](https://example.com/a "API reference")');
  assert.match(html, /href="https:\/\/example\.com\/a"/);
  assert.match(html, /title="API reference"/);
  assert.match(html, /aria-description="API reference"/);
  assert.match(html, />docs</);
  assert.doesNotMatch(html, />API reference</);
  const single = renderCompleted("[src](https://example.com/b 'source')");
  assert.match(single, /title="source"/);
  const paren = renderCompleted("[paren](https://example.com/c (paren tip))");
  assert.match(paren, /title="paren tip"/);
  const plain = renderCompleted("[plain](https://example.com/d)");
  assert.doesNotMatch(plain, /title=/);
  assert.doesNotMatch(plain, /aria-description=/);
  const blank = renderCompleted('[blank](https://example.com/e "   ")');
  assert.doesNotMatch(blank, /title=/);
  const quoted = renderCompleted('[docs](https://example.com/a "say \\"hi\\"")');
  assert.match(quoted, /title="say &quot;hi&quot;"/);
  const mail = renderCompleted('[mail](mailto:user@example.com "Email me")');
  assert.match(mail, /title="Email me"/);
  assert.match(mail, /href="mailto:user@example.com"/);
  const script = renderCompleted('[bad](javascript:alert(1) "xss")');
  assert.doesNotMatch(script, /<a /);
  assert.match(script, />bad</);
  const streaming = renderCompleted('[docs](https://example.com/a "API reference")', false);
  assert.doesNotMatch(streaming, /title=/);
  assert.doesNotMatch(streaming, /aria-description=/);
  const resolved = resolveReferenceLinks(
    'See [docs][guide].\n\n[guide]: https://example.com/guide "Guide title"\n',
    true,
  );
  const refHtml = renderCompleted(resolved);
  assert.match(refHtml, /title="Guide title"/);
  assert.match(refHtml, />docs</);
  const fence = renderCompleted(
    '```\n[docs](https://example.com/a "nope")\n```\n\n[real](https://example.com/b "yes")',
  );
  assert.equal((fence.match(/title="/g) ?? []).length, 1);
  assert.match(fence, /title="yes"/);
});

test("table cells, the destination pill, and copy stay on their existing paths", () => {
  const table = splitMarkdownTables(
    '| Name | Link |\n| --- | --- |\n| Ada | [docs](https://example.com/a "API reference") |\n',
    true,
  );
  assert.equal(table[0]?.type, "table");
  if (table[0]?.type !== "table") return;
  const cell = table[0].table.rows[0]?.[1] ?? "";
  const html = renderCompleted(cell);
  assert.match(html, /title="API reference"/);
  assert.match(html, /href="https:\/\/example\.com\/a"/);
  assert.match(body, /linkStatusHover\(id, url\)/);
  assert.match(body, /title=\{hint \|\| undefined\}/);
  assert.match(body, /aria-description=\{hint \|\| undefined\}/);
  assert.equal(body.split("markdownAnchor(href, title, completed, children)").length, 4);
  assert.match(body, /href=\{linkHref\(piece\.value\)\} preview=\{!streaming\}/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(plain, /return opts\.completed/);
  assert.match(src, /No new HTTP/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /copyText/);
  const shown = restoreMarkdownEscapes(html);
  assert.match(shown, /API reference/);
});

test("iOS wires the hint, OpenAPI stays 0.18.0, and the docs name v1.46", () => {
  assert.match(swift, /static func hint\(_ title: String\?, completed: Bool\) -> String/);
  assert.match(swift, /if !completed \{ return "" \}/);
  assert.match(swift, /static func annotate\(_ text: inout AttributedString, source: String, completed: Bool\)/);
  assert.match(swift, /if !completed \|\| source\.isEmpty \{ return \}/);
  assert.match(swift, /snorlaxLinkTitle/);
  assert.match(swift, /static func consumePreviewHint\(\) -> String\?/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.match(markdown, /MarkdownLinkTitle\.annotate/);
  assert.doesNotMatch(mid, /MarkdownLinkTitle/);
  assert.match(quote, /MarkdownLinkTitle\.previewHint/);
  assert.match(quote, /LinkPreview\.configuration\(for: url, open: onLink\)/);
  assert.match(preview, /accessibilityHint = hint/);
  assert.match(preview, /titleLabel\.text = hint/);
  assert.match(preview, /label\.text = text/);
  assert.match(preview, /preview: \.view\(headerView\(destination\)\)/);
  assert.match(preview, /UIMenu\(title: destination/);
  assert.doesNotMatch(preview, /withAnimation/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.46 /);
  assert.match(spec, /## 146\. v1\.46/);
  assert.match(spec, /CommonMark link titles in completed assistant replies/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_link_title\.py/);
  assert.match(pkg, /markdownLinkTitle\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
