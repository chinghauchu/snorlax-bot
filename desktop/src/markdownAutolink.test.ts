// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React, { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { restoreMarkdownEscapes, protectMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { neutralizeUnsafeImages } from "./markdownImage.ts";
import {
  isSafeMailto,
  mailtoAddress,
  prepareAngleAutolinks,
  safeLinkHref,
} from "./markdownAutolink.ts";
import { splitMarkdownTables } from "./markdownTable.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownAutolink.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const plain = readFileSync(join(here, "midStreamPlaintext.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownAutolink.swift"),
  "utf8",
);
const links = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "WebLinks.swift"), "utf8");
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const quote = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSelection.swift"), "utf8");
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

const PHRASE = "v1.43 CommonMark angle-bracket autolinks in completed assistant replies";

function show(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" ? restoreMarkdownEscapes(child) : child,
  );
}

function plainText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return plainText(props.children);
  }
  return "";
}

function Anchor({ href, children }: { href?: string; children?: ReactNode }) {
  const raw = restoreMarkdownEscapes(href ?? "");
  const url = safeLinkHref(raw);
  const label = restoreMarkdownEscapes(plainText(children));
  if (!url) return React.createElement(React.Fragment, null, label);
  return React.createElement("a", { href: url, className: "md-link" }, label);
}

/** Same order as MarkdownChunk: math, images, autolinks, escapes, hard breaks. */
function render(text: string, completed = true): string {
  const extracted = extractMath(text);
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, completed),
    completed,
  );
  const source = applyHardLineBreaks(
    protectMarkdownEscapes(mathText, completed),
    completed,
  );
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      urlTransform: (url: string) => url,
      components: {
        a: Anchor,
        p: ({ children }: { children?: ReactNode }) => React.createElement("p", null, show(children)),
        li: ({ children }: { children?: ReactNode }) => React.createElement("li", null, show(children)),
        strong: ({ children }: { children?: ReactNode }) =>
          React.createElement("strong", null, show(children)),
      },
      children: source,
    }),
  );
}

test("https autolinks are links and the brackets are not shown", () => {
  assert.equal(prepareAngleAutolinks("<https://example.com/path>", true), "<https://example.com/path>");
  const html = render("<https://example.com/path>");
  assert.match(html, /<a href="https:\/\/example\.com\/path" class="md-link">https:\/\/example\.com\/path<\/a>/);
  assert.doesNotMatch(html, /&lt;https/);
  const trailed = render("See <https://example.com>.");
  assert.match(trailed, /See <a href="https:\/\/example\.com" class="md-link">https:\/\/example\.com<\/a>\./);
  const paren = render("<https://example.com/a(b)>");
  assert.match(paren, /href="https:\/\/example\.com\/a\(b\)"/);
  assert.match(paren, />https:\/\/example\.com\/a\(b\)<\/a>/);
  const upper = render("<HTTP://Example.COM/a>");
  assert.match(upper, /href="HTTP:\/\/Example\.COM\/a"/);
  assert.match(upper, />HTTP:\/\/Example\.COM\/a<\/a>/);
  const bold = render("**<https://example.com>**");
  assert.match(bold, /<strong><a href="https:\/\/example\.com" class="md-link">https:\/\/example\.com<\/a><\/strong>/);
});

test("email autolinks are mailto links showing the address", () => {
  assert.equal(prepareAngleAutolinks("<user@example.com>", true), "<user@example.com>");
  assert.equal(mailtoAddress("mailto:user@example.com"), "user@example.com");
  assert.equal(isSafeMailto("mailto:user@example.com"), true);
  assert.equal(safeLinkHref("mailto:user@example.com"), "mailto:user@example.com");
  assert.equal(isSafeMailto("mailto:user@example.com?subject=hi"), false);
  assert.equal(safeLinkHref("mailto:user@example.com?subject=hi"), "");
  assert.equal(isSafeMailto("MAILTO:User@Example.COM"), true);
  assert.equal(mailtoAddress("mailto:foo+special@Bar.baz-bar0.com"), "foo+special@Bar.baz-bar0.com");
  assert.equal(mailtoAddress("mailto:foo@bar"), "foo@bar");
  assert.equal(isSafeMailto("mailto:not an email"), false);
  assert.equal(safeLinkHref("javascript:alert(1)"), "");
  const html = render("Write <user@example.com> please");
  assert.match(
    html,
    /Write <a href="mailto:user@example.com" class="md-link">user@example.com<\/a> please/,
  );
  assert.doesNotMatch(html, /&lt;user@example\.com&gt;/);
  const plus = render("<foo+special@Bar.baz-bar0.com>");
  assert.match(plus, /href="mailto:foo\+special@Bar\.baz-bar0\.com"/);
  assert.match(plus, />foo\+special@Bar\.baz-bar0\.com<\/a>/);
  const bare = render("<foo@bar>");
  assert.match(bare, /href="mailto:foo@bar"/);
  const explicit = render("[user@example.com](mailto:user@example.com)");
  assert.match(explicit, /href="mailto:user@example.com"/);
  const queried = render("[go](mailto:user@example.com?subject=hi)");
  assert.doesNotMatch(queried, /<a /);
  assert.match(queried, /go/);
  const script = render("[go](javascript:alert(1))");
  assert.doesNotMatch(script, /<a /);
  assert.match(script, /go/);
});

test("unsafe schemes and non-autolinks stay literal, including brackets", () => {
  const cases = [
    "<javascript:alert(1)>",
    "<ftp://files.example.com/a>",
    "<file:///etc/passwd>",
    "<data:text/html,hi>",
    "<mailto:user@example.com>",
    "<ab:>",
    "<https://>",
  ];
  for (const source of cases) {
    const prepared = prepareAngleAutolinks(source, true);
    assert.notEqual(prepared, source);
    assert.equal(restoreMarkdownEscapes(prepared), source);
    const html = render(source);
    assert.doesNotMatch(html, /<a /);
    assert.match(html, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/</g, "&lt;").replace(/>/g, "&gt;")));
  }
  const words = render("<not a link>");
  assert.equal(prepareAngleAutolinks("<not a link>", true), "<not a link>");
  assert.doesNotMatch(words, /<a /);
  assert.match(words, /&lt;not a link&gt;/);
  const spaced = render("<https://example.com/a b>");
  assert.doesNotMatch(spaced, /<a /);
  assert.match(spaced, /&lt;https:\/\/example\.com\/a b&gt;/);
  const short = render("<m:abc>");
  assert.equal(prepareAngleAutolinks("<m:abc>", true), "<m:abc>");
  assert.doesNotMatch(short, /<a /);
  assert.match(short, /&lt;m:abc&gt;/);
  const mixed = render("Go <https://example.com/path> or <javascript:alert(1)> and <user@example.com>.");
  assert.match(mixed, /href="https:\/\/example\.com\/path"/);
  assert.match(mixed, /href="mailto:user@example.com"/);
  assert.match(mixed, /&lt;javascript:alert\(1\)&gt;/);
  assert.equal((mixed.match(/<a /g) ?? []).length, 2);
});

test("escapes, code, math, and table code cells stay literal", () => {
  assert.equal(prepareAngleAutolinks("\\<https://example.com>", true), "\\<https://example.com>");
  assert.equal(prepareAngleAutolinks("\\<user@example.com>", true), "\\<user@example.com>");
  const escapedUrl = render("\\<https://example.com>");
  assert.doesNotMatch(escapedUrl, /<a /);
  assert.match(escapedUrl, /&lt;https:\/\/example\.com&gt;/);
  const escapedMail = render("\\<user@example.com>");
  assert.doesNotMatch(escapedMail, /<a /);
  assert.match(escapedMail, /&lt;user@example\.com&gt;/);
  const span = "see `<https://example.com>` and `<user@example.com>`";
  assert.equal(prepareAngleAutolinks(span, true), span);
  const spanHtml = render(span);
  assert.doesNotMatch(spanHtml, /<a /);
  assert.match(spanHtml, /<code>&lt;https:\/\/example\.com&gt;<\/code>/);
  assert.match(spanHtml, /<code>&lt;user@example\.com&gt;<\/code>/);
  const fence = "```\n<javascript:alert(1)>\n<user@example.com>\n```";
  assert.equal(prepareAngleAutolinks(fence, true), fence);
  const fenceHtml = render(fence);
  assert.doesNotMatch(fenceHtml, /<a /);
  assert.match(fenceHtml, /&lt;javascript:alert\(1\)&gt;/);
  assert.match(fenceHtml, /&lt;user@example\.com&gt;/);
  const indented = "before\n\n    <javascript:alert(1)>\n";
  assert.equal(prepareAngleAutolinks(indented, true), indented);
  const indentedHtml = render(indented);
  assert.doesNotMatch(indentedHtml, /<a /);
  assert.match(indentedHtml, /<code>&lt;javascript:alert\(1\)&gt;/);
  const math = "\\( <https://example.com> \\)";
  assert.equal(prepareAngleAutolinks(math, true), math);
  const mathHtml = render(math);
  assert.doesNotMatch(mathHtml, /href="https:\/\/example\.com"/);
  const block = "$$\n<user@example.com>\n$$";
  assert.equal(prepareAngleAutolinks(block, true), block);
  const table = [
    "| code | link |",
    "| --- | --- |",
    "| `<javascript:alert(1)>` | <user@example.com> |",
  ].join("\n");
  const parts = splitMarkdownTables(table, true);
  assert.equal(parts[0]?.type, "table");
  if (parts[0]?.type !== "table") return;
  const codeCell = render(parts[0].table.rows[0]?.[0] ?? "");
  const linkCell = render(parts[0].table.rows[0]?.[1] ?? "");
  assert.doesNotMatch(codeCell, /<a /);
  assert.match(codeCell, /&lt;javascript:alert\(1\)&gt;/);
  assert.match(linkCell, /href="mailto:user@example.com"/);
  assert.match(linkCell, />user@example.com<\/a>/);
});

test("streaming stays unchanged and copy keeps markdown source", () => {
  const raw = "See <https://example.com> and <user@example.com> and <javascript:alert(1)>";
  assert.equal(prepareAngleAutolinks(raw, false), raw);
  assert.equal(prepareAngleAutolinks("", true), "");
  const broken = render("See <https://example.com>  \nnext");
  assert.match(broken, /<br/);
  assert.match(broken, /href="https:\/\/example\.com"/);
  assert.match(body, /prepareAngleAutolinks/);
  assert.match(body, /safeLinkHref/);
  assert.match(body, /isSafeWebUrl/);
  assert.match(body, /linkStatusHover/);
  assert.match(body, /openOsBrowser/);
  assert.equal(body.split("prepareAngleAutolinks(").length, 4);
  assert.equal(body.split("protectMarkdownEscapes(mathText, completed)").length, 4);
  const prepareAt = body.indexOf("prepareAngleAutolinks(");
  const protectAt = body.indexOf("protectMarkdownEscapes(mathText, completed)");
  assert.ok(prepareAt >= 0 && protectAt > prepareAt);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(app, /shouldRenderMarkdown/);
  assert.match(plain, /return opts\.completed/);
  assert.doesNotMatch(plain, /prepareAngleAutolinks/);
  assert.match(src, /markdown source/);
  assert.match(src, /completed: false/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /static func prepare/);
  assert.match(swift, /if !completed/);
  assert.match(swift, /markdown source/);
  assert.match(swift, /§§SBE/);
  assert.match(links, /isMailtoEmail/);
  assert.match(links, /func allows/);
  assert.match(markdown, /MarkdownAutolink\.prepare/);
  assert.match(markdown, /MarkdownEscape\.protect\(src, completed: completed\)/);
  const prep = markdown.indexOf("MarkdownAutolink.prepare");
  const protect = markdown.indexOf("MarkdownEscape.protect(src, completed: completed)");
  assert.ok(prep >= 0 && protect > prep);
  assert.match(quote, /LinkPreview\.configuration/);
  assert.match(quote, /WebLinks\.allows\(url\)/);
  assert.doesNotMatch(mid, /MarkdownAutolink/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.43 /);
  assert.match(spec, /## 143\. v1\.43/);
  assert.match(spec, /angle-bracket autolinks in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_angle_autolink\.py/);
  assert.match(pkg, /markdownAutolink\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
