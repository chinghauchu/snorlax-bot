// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { encodeLinkDestination, isSafeWebUrl } from "./linkify.ts";
import { imageSourceKind, neutralizeUnsafeImages } from "./markdownImage.ts";
import { inlineLinks } from "./markdownLinkTitle.ts";
import {
  prepareSpacedLinkDestinations,
  resolveReferenceLinks,
} from "./markdownReferenceLink.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownReferenceLink.ts"), "utf8");
const image = readFileSync(join(here, "markdownImage.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownReferenceLink.swift"),
  "utf8",
);
const imageSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownImage.swift"),
  "utf8",
);
const titleSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLinkTitle.swift"),
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
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE =
  "v1.74 CommonMark spaced angle-bracket link destinations in completed assistant replies";

function render(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, { urlTransform: (url: string) => url, children: text }),
  );
}

function norm(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\n/g, "");
}

/** Same order as a completed bubble: resolve references, then encode pointy destinations. */
function pipeline(text: string): string {
  const linked = resolveReferenceLinks(text, true);
  const prepared = prepareSpacedLinkDestinations(linked, true);
  return render(neutralizeUnsafeImages(prepared, true));
}

test("a pointy destination with spaces matches react-markdown, titles included", () => {
  const cases = [
    "[docs](<https://example.com/my file>)",
    '[docs](<https://example.com/my file> "API")',
    "[docs](<https://example.com/my file> 'API')",
    "[docs](<https://example.com/my file> (API))",
    "[docs](<https://example.com/my\\ file> 'keep')",
    "[docs](<https://example.com/a\\>b c> (tip))",
    "[docs](<https://example.com/a\tb>)",
    "[docs](<https://example.com/a  b>)",
    "See [docs].\n\n[docs]: <https://example.com/my file> 'Single title'",
    "See [docs].\n\n[docs]: <https://example.com/my file> (Paren title)",
    "See [docs][ref].\n\n[ref]: <https://example.com/my file> \"Title\"",
    "See [ref][].\n\n[ref]: <https://example.com/my file>",
    "See [a:b].\n\n[a:b]: <https://example.com/my file>",
    "See [docs].\n\n[docs]:\n<https://example.com/my file>\n'title'",
    "> [docs]: <https://example.com/my file>\n>\n> See [docs].",
    "See [docs](<https://example.com/my file>).\n\n[docs]: https://example.com/other",
    "![alt](<https://example.com/a b.png>)",
    "![alt](<https://example.com/a b.png> 'cap')",
    "code `<https://example.com/a b>` and [docs](<https://example.com/a b>)",
    "```\n[docs](<https://example.com/a b>)\n```\n",
    "    [docs](<https://example.com/a b>)\n",
    "\\( [docs](<https://example.com/a b>) \\)",
    "not a link <https://example.com/a b> end",
  ];
  for (const source of cases) {
    assert.equal(norm(pipeline(source)), norm(render(source)), JSON.stringify(source));
  }
  const html = pipeline("[docs](<https://example.com/my file> 'API')");
  assert.match(html, /href="https:\/\/example.com\/my%20file"/);
  assert.match(html, /title="API"/);
  assert.match(html, />docs</);
  assert.equal(isSafeWebUrl("https://example.com/my%20file"), true);
  assert.equal(encodeLinkDestination("https://example.com/my file"), "https://example.com/my%20file");
  assert.equal(
    encodeLinkDestination("https://example.com/my\\ file"),
    "https://example.com/my%5C%20file",
  );
});

test("a same-label shortcut does not steal a spaced inline link, and find keeps the space", () => {
  const source = "See [docs](<https://example.com/my file>).\n\n[docs]: https://example.com/other";
  const linked = resolveReferenceLinks(source, true);
  assert.match(linked, /my file/);
  assert.doesNotMatch(linked, /example\.com\/other/);
  assert.doesNotMatch(linked, /%20/);
  const prepared = prepareSpacedLinkDestinations(linked, true);
  assert.match(prepared, /my%20file/);
  assert.equal(prepareSpacedLinkDestinations(source, false), source);
  assert.equal(resolveReferenceLinks(source, false), source);

  const titled = inlineLinks("[docs](<https://example.com/my file> 'API')");
  assert.equal(titled[0]?.dest, "https://example.com/my file");
  assert.equal(titled[0]?.title, "API");
  const paren = inlineLinks("[docs](<https://example.com/my file> (API))");
  assert.equal(paren[0]?.title, "API");
  const kept = inlineLinks("[docs](<https://example.com/my\\ file>)");
  assert.equal(kept[0]?.dest, "https://example.com/my\\ file");
  assert.equal(imageSourceKind("https://example.com/a b.png"), "remote");
  assert.equal(imageSourceKind("javascript:alert(1)"), "literal");
});

test("docs, CI, and OpenAPI record v1.74 without a new route", () => {
  assert.match(src, /v1\.74/);
  assert.match(src, /export function prepareSpacedLinkDestinations/);
  assert.match(src, /ASCII_PUNCT\.includes/);
  assert.doesNotMatch(src, /ch === "\\n" \|\| ch === "<" \|\| ch === " " \|\| ch === "\\t"/);
  assert.match(body, /prepareSpacedLinkDestinations\(sourceText, completed\)/);
  assert.match(image, /encodeLinkDestination/);
  assert.match(app, /resolveReferenceLinks\(/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /prepareSpacedLinkDestinations/);
  assert.match(swift, /v1\.74/);
  assert.match(swift, /func prepareSpacedDestinations/);
  assert.match(swift, /func encodeDestination/);
  assert.match(swift, /isAsciiPunct/);
  assert.doesNotMatch(swift, /ch == "\\n" \|\| ch == "<" \|\| ch == " " \|\| ch == "\\t"/);
  assert.match(imageSwift, /v1\.74/);
  assert.match(imageSwift, /MarkdownReferenceLink\.encodeDestination/);
  assert.match(titleSwift, /v1\.74/);
  assert.match(markdown, /prepareSpacedDestinations\(self\.source, completed: completed\)/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.74 /);
  assert.match(spec, /## 174\. v1\.74/);
  assert.match(spec, /spaced angle-bracket link destinations/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_angle_dest\.py/);
  assert.match(pkg, /markdownAngleDest\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(readFileSync(join(here, "markdownTableAlign.test.ts"), "utf8"), /v1\.55/);
  assert.match(readFileSync(join(here, "markdownTableClip.test.ts"), "utf8"), /v1\.65/);
});
