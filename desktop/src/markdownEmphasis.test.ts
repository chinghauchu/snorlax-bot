// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { prepareAngleAutolinks } from "./markdownAutolink.ts";
import { remarkStrikethrough } from "./markdownBreak.ts";
import {
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import {
  CMARK_SPACE_CODES,
  NON_CMARK_SPACE_CODES,
  emphasisAnimates,
  protectEmphasisWhitespace,
} from "./markdownEmphasis.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { prepareImageAlts } from "./markdownImageAlt.ts";
import { neutralizeUnsafeImages } from "./markdownImage.ts";
import { prepareLinkDestinations } from "./markdownLinkDest.ts";
import { prepareLinkTitleForms } from "./markdownLinkTitle.ts";
import {
  prepareSpacedLinkDestinations,
} from "./markdownReferenceLink.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";
import { remarkOrderedTaskMarkers } from "./markdownOrderedTask.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownEmphasis.ts"), "utf8");
const hard = readFileSync(join(here, "markdownHardBreak.ts"), "utf8");
const escapeSrc = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const alt = readFileSync(join(here, "markdownImageAlt.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEmphasis.swift"),
  "utf8",
);
const escapeSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEscape.swift"),
  "utf8",
);
const altSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownImageAlt.swift"),
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
  "v1.94 cmark-gfm emphasis delimiter runs in completed assistant replies";

/** Same prepare order and remark plugins a completed reply uses. */
function render(source: string, completed = true): string {
  const text = prepareLinkTitleForms(
    prepareImageAlts(
      prepareSpacedLinkDestinations(
        prepareLinkDestinations(source, completed),
        completed,
      ),
      completed,
    ),
    completed,
  );
  const extracted = extractMath(text);
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, completed),
    completed,
  );
  const prepared = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(mathText, completed), completed),
      completed,
    ),
    completed,
  );
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed
        ? [remarkOrderedTaskMarkers, remarkHardBreaks, remarkStrikethrough]
        : [],
      urlTransform: (url: string) => url,
      children: prepared,
    }),
  );
  return restoreMarkdownEscapes(html);
}

test("rule of 3, flanking, intraword, and stack order already match", () => {
  assert.equal(render("*foo**bar**baz*"), "<p><em>foo<strong>bar</strong>baz</em></p>");
  assert.equal(render("*foo**bar*"), "<p><em>foo**bar</em></p>");
  assert.equal(render("foo***bar***baz"), "<p>foo<em><strong>bar</strong></em>baz</p>");
  assert.equal(render("**foo*bar**"), "<p><strong>foo*bar</strong></p>");
  assert.equal(render("*foo _bar* baz_"), "<p><em>foo _bar</em> baz_</p>");
  assert.equal(render("***foo** bar*"), "<p><em><strong>foo</strong> bar</em></p>");
  assert.equal(render("foo*bar*"), "<p>foo<em>bar</em></p>");
  assert.equal(render("foo*bar*baz"), "<p>foo<em>bar</em>baz</p>");
  assert.equal(render("foo_bar_"), "<p>foo_bar_</p>");
  assert.equal(render("5*6*78"), "<p>5<em>6</em>78</p>");
  assert.equal(render("5_6_78"), "<p>5_6_78</p>");
  assert.equal(render("пристаням_стремятся_"), "<p>пристаням_стремятся_</p>");
  assert.equal(render('a*"foo"*'), "<p>a*&quot;foo&quot;*</p>");
  assert.equal(render("foo-_(bar)_"), "<p>foo-<em>(bar)</em></p>");
  assert.equal(render("*(bar)*."), "<p><em>(bar)</em>.</p>");
  assert.equal(render("_(bar)_."), "<p><em>(bar)</em>.</p>");
  assert.equal(render("*\u00a0a\u00a0*"), "<p>*\u00a0a\u00a0*</p>");
  assert.equal(render("*\u2003a\u2003*"), "<p>*\u2003a\u2003*</p>");
  assert.equal(render("*_foo_*"), "<p><em><em>foo</em></em></p>");
  assert.equal(render("***foo***"), "<p><em><strong>foo</strong></em></p>");
  assert.equal(render("use __init__ here"), "<p>use __init__ here</p>");
});

test("nested strong collapses and non-cmark spaces flank like cmark-gfm", () => {
  assert.equal(render("****foo****"), "<p><strong>foo</strong></p>");
  assert.equal(render("____foo____"), "<p><strong>foo</strong></p>");
  assert.equal(render("******foo******"), "<p><strong>foo</strong></p>");
  assert.equal(render("_____foo_____"), "<p><em><strong>foo</strong></em></p>");
  assert.equal(render("foo******bar*********baz"), "<p>foo<strong>bar</strong>***baz</p>");
  assert.equal(render("__foo, __bar__, baz__"), "<p><strong>foo, bar, baz</strong></p>");
  assert.equal(render("__foo __bar__ baz__"), "<p><strong>foo bar baz</strong></p>");
  assert.equal(render("**foo **bar****"), "<p><strong>foo bar</strong></p>");
  assert.equal(render("____foo__ bar__"), "<p><strong>foo bar</strong></p>");
  assert.equal(render("*\u000ba\u000b*"), "<p><em>\u000ba\u000b</em></p>");
  assert.equal(render("*\u0085a\u0085*"), "<p><em>\u0085a\u0085</em></p>");
  assert.equal(render("*\u2028a\u2028*"), "<p><em>\u2028a\u2028</em></p>");
  assert.equal(render("*\u2029a\u2029*"), "<p><em>\u2029a\u2029</em></p>");
  assert.equal(render("*\ufeffa\ufeff*"), "<p><em>\ufeffa\ufeff</em></p>");
  assert.equal(render("a*\u2028foo*"), "<p>a<em>\u2028foo</em></p>");
  assert.equal(render("`*\u000ba*`"), "<p><code>*\u000ba*</code></p>");
  assert.equal(protectEmphasisWhitespace("`*\u000ba*`"), "`*\u000ba*`");
  assert.equal(protectEmphasisWhitespace("```\n*\u000ba*\n```"), "```\n*\u000ba*\n```");
  assert.equal(protectEmphasisWhitespace("\n    *\u000ba*\n"), "\n    *\u000ba*\n");
  assert.equal(
    protectEmphasisWhitespace("[a](https://example.com/\u000bb)"),
    "[a](https://example.com/\u000bb)",
  );
  assert.equal(protectEmphasisWhitespace("*\u000ba*", false), "*\u000ba*");
  assert.equal(render("*\u000ba*", false), "<p>*\u000ba*</p>");
  const vtAlt = restoreMarkdownEscapes(
    prepareImageAlts("![*\u000ba*](https://example.com/a.png)"),
  );
  assert.equal(vtAlt, "![\u000ba](https://example.com/a.png)");
  const nbspAlt = "![*\u00a0a\u00a0*](https://example.com/a.png)";
  assert.equal(restoreMarkdownEscapes(prepareImageAlts(nbspAlt)), nbspAlt);
  const url = "https://example.com/a\u000bb";
  assert.equal(protectEmphasisWhitespace(url), url);
});

test("both platforms share the cmark space set and the reply path", () => {
  assert.deepEqual(NON_CMARK_SPACE_CODES, [0x000b, 0x0085, 0x2028, 0x2029, 0xfeff]);
  assert.equal(CMARK_SPACE_CODES.includes(0x00a0), true);
  assert.equal(CMARK_SPACE_CODES.includes(0x000b), false);
  assert.match(src, /export function protectEmphasisWhitespace/);
  assert.match(src, /export function flattenNestedStrong/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/MarkdownEmphasis.swift`/);
  assert.match(hard, /flattenNestedStrong\(tree\)/);
  assert.match(escapeSrc, /protectEmphasisWhitespace\(/);
  assert.match(alt, /isCmarkUnicodeSpace/);
  assert.match(swift, /static func protect\(_ text: String, completed: Bool\) -> String/);
  assert.match(swift, /static func isCmarkSpace/);
  assert.match(swift, /static let nonCmarkSpaces: \[UInt32\] = \[0x000B, 0x0085, 0x2028, 0x2029, 0xFEFF\]/);
  assert.match(escapeSwift, /MarkdownEmphasis.protect\(symbols, completed: true\)/);
  assert.match(escapeSwift, /MarkdownEmphasis.restoreString/);
  assert.match(altSwift, /MarkdownEmphasis.isCmarkSpace/);
  assert.doesNotMatch(altSwift, /properties\.isWhitespace/);
  assert.match(body, /\\uE000SBW/);
  assert.match(body, /remarkHardBreaks, remarkStrikethrough/);
  assert.equal(body.split("protectMarkdownEscapes(mathText, completed)").length, 4);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectEmphasisWhitespace\(reply\.content/);
  assert.equal(emphasisAnimates(false), false);
  assert.equal(emphasisAnimates(true), false);
  assert.match(src, /markdown source/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v1.94 "));
  assert.match(spec, /## 194\. v1\.94/);
  assert.match(ci, /test_ios_markdown_emphasis\.py/);
  assert.match(pkg, /markdownEmphasis\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
