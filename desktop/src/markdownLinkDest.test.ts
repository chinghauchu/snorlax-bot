// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import {
  cmarkLinkHref,
  prepareLinkDestinations,
} from "./markdownLinkDest.ts";
import { prepareLinkTitleForms } from "./markdownLinkTitle.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownLinkDest.ts"), "utf8");
const escapeSrc = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLinkDest.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const escapeSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEscape.swift"),
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
  "v1.79 CommonMark link and image destination entities in completed assistant replies";

function render(source: string): string {
  const prepared = prepareLinkDestinations(source, true);
  const escaped = protectMarkdownEscapes(prepared, true);
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      urlTransform: (url: string) => url,
      children: escaped,
    }),
  );
  return restoreMarkdownEscapes(html);
}

function hrefOf(html: string): string {
  return /(?:href|src)="([^"]*)"/.exec(html)?.[1] ?? "";
}

test("destinations resolve entities and escapes like cmark-gfm", () => {
  const cases: Array<[string, string]> = [
    ["[a](/f&ouml;&ouml;)", "/f%C3%B6%C3%B6"],
    ["[a](/u&amp;v)", "/u&amp;v"],
    ["[a](foo\\)\\:)", "foo):"],
    ["[a](/a&#35;b)", "/a#b"],
    ["[a](/a&#x26;b)", "/a&amp;b"],
    ["[a](/foo&bar;)", "/foo&amp;bar;"],
    ["[a](&notanentity;)", "&amp;notanentity;"],
    ["[a](foo%20b&auml;)", "foo%20b%C3%A4"],
    ["[a](/url\\bar\\*baz)", "/url%5Cbar*baz"],
    ["[a](<foo bar>)", "foo%20bar"],
    ["[a](<foo\\ bar>)", "foo%5C%20bar"],
    ["[a](<foo\\>bar>)", "foo%3Ebar"],
    ["[a](<\\<foo>)", "%3Cfoo"],
    ["[a](/a&amp;amp;b)", "/a&amp;amp;b"],
    ["[a](/a\\&amp;b)", "/a&amp;b"],
    ["[a](/a&#39;b)", "/a&#x27;b"],
    ["[a](/a&apos;b)", "/a&#x27;b"],
    ["[a](/a&quot;b)", "/a%22b"],
    ["[a](/a&nbsp;b)", "/a%C2%A0b"],
    ["[a](/a&copy;b)", "/a%C2%A9b"],
    ["[a](/a&#x1F600;b)", "/a%F0%9F%98%80b"],
    ["[a](/a&#0;b)", "/a%EF%BF%BDb"],
    ["[a](/a&#xD800;b)", "/a%EF%BF%BDb"],
    ["[a](/a&#11;b)", "/a%0Bb"],
    ["[a](/a&#12;b)", "/a%0Cb"],
    ["[a](/a&#13;b)", "/a%0Db"],
    ["[a](/a&#9;b)", "/a%09b"],
    ["[a](/a&#xFFFE;b)", "/a%FEb"],
    ["[a](/a&#xFFFF;b)", "/a%FFb"],
    ["[a](/a&#x10FFFE;b)", "/a%F4%8F%BF%BEb"],
    ["[a](< foo >)", "foo"],
    ["[a](<\\ >)", "%5C"],
    ["[a](/a&fjlig;b)", "/afjb"],
    ["[a](/a&NotEqualTilde;b)", "/a%E2%89%82%CC%B8b"],
    ["![alt](/f&copy;&ouml;)", "/f%C2%A9%C3%B6"],
  ];
  for (const [source, href] of cases) {
    assert.equal(hrefOf(render(source)), href, source);
  }
  assert.equal(cmarkLinkHref("foo\\ bar"), "foo%5C%20bar");
  assert.equal(cmarkLinkHref("/f&ouml;&ouml;"), "/f%C3%B6%C3%B6");
});

test("reference definitions, titles, and a second pass stay stable", () => {
  const linked = resolveReferenceLinks("[a]\n\n[a]: /f&ouml;&ouml;\n", true);
  assert.equal(hrefOf(render(linked)), "/f%C3%B6%C3%B6");
  const slashed = resolveReferenceLinks("[a]\n\n[a]: /url\\bar\\*baz\n", true);
  assert.match(slashed, /\\bar/);
  assert.equal(hrefOf(render(slashed)), "/url%5Cbar*baz");
  const image = resolveReferenceLinks(
    "![alt][img]\n\n[img]: /f&copy;&ouml;\n",
    true,
  );
  assert.equal(hrefOf(render(image)), "/f%C2%A9%C3%B6");

  const titled = prepareLinkTitleForms(
    prepareLinkDestinations('[a](/u&amp;v "t&amp;t")', true),
    true,
  );
  assert.match(titled, /\/u&#38;v/);
  assert.match(titled, /t&#38;t/);
  const titledHtml = render(titled);
  assert.equal(hrefOf(titledHtml), "/u&amp;v");
  assert.match(titledHtml, /title="t&t"/);

  const once = prepareLinkDestinations("[a](/u&amp;v)", true);
  assert.equal(once, "[a](/u&#38;v)");
  assert.equal(prepareLinkDestinations(once, true), once);
  const angled = prepareLinkDestinations("[a](foo\\)\\:)", true);
  assert.equal(angled, "[a](<foo):>)");
  assert.equal(prepareLinkDestinations(angled, true), angled);
  assert.equal(prepareLinkDestinations("[a]()", true), "[a]()");
  assert.match(render("[a](< >)"), /href=""/);
});

test("over-long numeric references stay characters, and non-links stay literal", () => {
  const over = render("[a](/q?&#87654321;)");
  assert.match(over, /href="\/q\?&amp;#87654321;"/);
  assert.doesNotMatch(over, /\uFFFD/);
  const hex = render("[a](/a&#x0001F600;b)");
  assert.match(hex, /href="\/a&amp;#x0001F600;b"/);
  assert.doesNotMatch(hex, /%F0%9F%98%80/);

  const bad = '[a](/f&ouml; "title "and" title")';
  assert.equal(prepareLinkDestinations(bad, true), bad);
  const note = "[^1]: /f&ouml;\n";
  assert.equal(prepareLinkDestinations(note, true), note);
  const coded = "`[a](/f&ouml;&ouml;)`";
  assert.equal(prepareLinkDestinations(coded, true), coded);
  assert.match(render(coded), /&amp;ouml;/);
  assert.doesNotMatch(render(coded), /%C3%B6/);
  const fence = "```\n[a](/f&ouml;&ouml;)\n```\n";
  assert.equal(prepareLinkDestinations(fence, true), fence);
  assert.equal(
    prepareLinkDestinations("[a](javascript:alert(1))", true),
    "[a](javascript:alert(1))",
  );
  const live = "[a](/f&ouml;&ouml;)";
  assert.equal(prepareLinkDestinations(live, false), live);
  assert.match(render("see &copy; now"), /see © now/);
  assert.equal(prepareLinkDestinations("[a](<foo\\>)", true), "[a](<foo\\>)");
});

test("docs, CI, and OpenAPI record v1.79 without a new route", () => {
  assert.match(src, /v1\.79/);
  assert.match(src, /export function prepareLinkDestinations/);
  assert.match(src, /export function cmarkLinkHref/);
  assert.match(src, /export function linkDestinationSpans/);
  assert.match(src, /&#38;/);
  assert.match(src, /digits > max/);
  assert.match(escapeSrc, /linkDestinationSpans/);
  assert.match(body, /prepareLinkDestinations\(sourceText, completed\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /prepareLinkDestinations/);
  assert.match(swift, /v1\.79/);
  assert.match(swift, /static func prepare/);
  assert.match(swift, /static func href/);
  assert.match(swift, /&#38;/);
  assert.match(swift, /digits > maxDigits/);
  assert.match(escapeSwift, /MarkdownLinkDest\.spans/);
  assert.match(
    markdown,
    /MarkdownLinkDest\.prepare\(self\.source, completed: completed\)/,
  );
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.79 /);
  assert.match(spec, /## 179\. v1\.79/);
  assert.match(spec, /destination entities in completed assistant replies/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_link_dest\.py/);
  assert.match(pkg, /markdownLinkDest\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
