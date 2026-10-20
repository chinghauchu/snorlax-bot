// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  emailHref,
  extendedMailtoAddress,
  isExtendedEmail,
  linkHref,
  splitWebUrls,
  type WebPiece,
} from "./linkify.ts";
import { isSafeMailto, safeLinkHref } from "./markdownAutolink.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";

const here = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "linkify.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "WebLinks.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const plain = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MidStreamPlaintext.swift"),
  "utf8",
);
const components = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "Components.swift"),
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

const PHRASE = "v1.45 GFM email autolinks in completed assistant replies";

function roundTrip(text: string, opts?: { streaming?: boolean; emails?: boolean }): WebPiece[] {
  const pieces = splitWebUrls(text, { emails: true, ...opts });
  assert.equal(
    pieces.map((piece) => piece.value).join(""),
    text,
    `pieces must rebuild ${JSON.stringify(text)}`,
  );
  return pieces;
}

function linksOf(text: string, opts?: { streaming?: boolean; emails?: boolean }): string[] {
  return roundTrip(text, opts)
    .filter((piece) => piece.type === "link")
    .map((piece) => piece.value);
}

test("a bare address is a mailto link and the text stays the address", () => {
  assert.equal(isExtendedEmail("foo@bar.baz"), true);
  assert.equal(isExtendedEmail("hello+xyz@mail.example"), true);
  assert.equal(isExtendedEmail("a.b-c_d@a.b"), true);
  assert.equal(isExtendedEmail("foo@bar_baz.com"), true);
  assert.equal(isExtendedEmail("Foo@Bar.baz"), true);
  assert.equal(emailHref("foo@bar.baz"), "mailto:foo@bar.baz");
  assert.equal(linkHref("foo@bar.baz"), "mailto:foo@bar.baz");
  assert.equal(isSafeMailto("mailto:foo@bar.baz"), true);
  assert.equal(isSafeMailto("mailto:foo@bar_baz.com"), true);
  assert.equal(safeLinkHref("mailto:foo@bar_baz.com"), "mailto:foo@bar_baz.com");
  assert.equal(extendedMailtoAddress("mailto:foo@bar.baz?subject=hi"), null);
  assert.equal(isSafeMailto("mailto:foo@bar.baz?subject=hi"), false);
  assert.equal(safeLinkHref("mailto:not an email"), "");

  assert.deepEqual(linksOf("foo@bar.baz"), ["foo@bar.baz"]);
  assert.deepEqual(linksOf("Write foo@bar.baz please"), ["foo@bar.baz"]);
  assert.deepEqual(linksOf("hello+xyz@mail.example"), ["hello+xyz@mail.example"]);
  assert.deepEqual(linksOf("(foo@bar.baz)"), ["foo@bar.baz"]);
  assert.deepEqual(linksOf("see foo@bar.baz, now"), ["foo@bar.baz"]);
  assert.deepEqual(linksOf("see foo@bar.baz!"), ["foo@bar.baz"]);
  assert.equal(linkHref("foo@bar.baz"), "mailto:foo@bar.baz");
  assert.match(body, /href=\{linkHref\(piece\.value\)\}/);
  assert.match(body, /className="md-link"/);
});

test("GFM rejects a missing dot, a plus after @, and a trailing dash or underscore", () => {
  assert.equal(isExtendedEmail("foo@bar"), false);
  assert.equal(isExtendedEmail("hello@mail+xyz.example"), false);
  assert.equal(isExtendedEmail("a.b-c_d@a.b-"), false);
  assert.equal(isExtendedEmail("a.b-c_d@a.b_"), false);
  assert.equal(isExtendedEmail("@bar.baz"), false);
  assert.equal(isExtendedEmail("foo@"), false);
  assert.deepEqual(linksOf("foo@bar"), []);
  assert.deepEqual(linksOf("hello@mail+xyz.example isn't valid, but hello+xyz@mail.example is."), [
    "hello+xyz@mail.example",
  ]);
  assert.deepEqual(linksOf("a.b-c_d@a.b"), ["a.b-c_d@a.b"]);
  assert.deepEqual(linksOf("a.b-c_d@a.b."), ["a.b-c_d@a.b"]);
  assert.deepEqual(linksOf("a.b-c_d@a.b-"), []);
  assert.deepEqual(linksOf("a.b-c_d@a.b_"), []);
  assert.equal(roundTrip("a.b-c_d@a.b.").some((piece) => piece.value === "."), true);
});

test("mailto: stays in the text; xmpp: and other schemes stay plain", () => {
  assert.equal(emailHref("mailto:foo@bar.baz"), "mailto:foo@bar.baz");
  assert.equal(emailHref("MAILTO:Foo@Bar.baz"), "mailto:Foo@Bar.baz");
  assert.equal(linkHref("mailto:a.b-c_d@a.b"), "mailto:a.b-c_d@a.b");
  assert.deepEqual(linksOf("mailto:foo@bar.baz"), ["mailto:foo@bar.baz"]);
  assert.deepEqual(linksOf("mailto:a.b-c_d@a.b."), ["mailto:a.b-c_d@a.b"]);
  assert.deepEqual(linksOf("mailto:a.b-c_d@a.b/"), ["mailto:a.b-c_d@a.b"]);
  assert.deepEqual(linksOf("mailto:a.b-c_d@a.b-"), []);
  assert.deepEqual(linksOf("xmpp:foo@bar.baz"), []);
  assert.deepEqual(linksOf("xmpp:foo@bar.baz/txt"), []);
  assert.deepEqual(linksOf("notmailto:foo@bar.baz"), []);
  assert.deepEqual(linksOf("see: foo@bar.baz"), ["foo@bar.baz"]);
  assert.equal(linkHref("mailto:foo@bar.baz"), "mailto:foo@bar.baz");
  assert.equal(emailHref("xmpp:foo@bar.baz"), null);
});

test("http, www, code, indented code, and escapes keep their shape", () => {
  assert.deepEqual(linksOf("https://user@example.com/a and user@example.com"), [
    "https://user@example.com/a",
    "user@example.com",
  ]);
  assert.deepEqual(linksOf("www.example.com and user@example.com"), [
    "www.example.com",
    "user@example.com",
  ]);
  assert.equal(linkHref("www.example.com"), "http://www.example.com");
  assert.equal(linkHref("https://example.com/a"), "https://example.com/a");
  assert.deepEqual(linksOf("use `user@example.com` then out@example.com"), [
    "out@example.com",
  ]);
  const fenced = ["before", "```", "user@example.com", "```", "after out@example.com"].join("\n");
  assert.deepEqual(linksOf(fenced), ["out@example.com"]);
  const indented = "para\n\n    user@example.com\n";
  assert.deepEqual(linksOf(indented), []);
  assert.match(roundTrip(indented).map((piece) => piece.value).join(""), /user@example.com/);
  const escaped = protectMarkdownEscapes("write user\\@example.com please", true);
  const pieces = splitWebUrls(escaped, { emails: true }).map((piece) => ({
    type: piece.type,
    value: restoreMarkdownEscapes(piece.value),
  }));
  assert.equal(pieces.some((piece) => piece.type === "link"), false);
  assert.match(pieces.map((piece) => piece.value).join(""), /user@example.com/);
});

test("user text and a streaming bubble do not gain email links", () => {
  assert.deepEqual(splitWebUrls("user@example.com").filter((piece) => piece.type === "link"), []);
  assert.deepEqual(linksOf("see user@example.com", { streaming: true }), []);
  assert.deepEqual(linksOf("see user@example.com next", { streaming: true }), [
    "user@example.com",
  ]);
  assert.deepEqual(linksOf("user@example.com", { emails: false }), []);
  const mention = app.slice(app.indexOf("function MentionText"), app.indexOf("function MentionText") + 900);
  assert.match(mention, /<HttpsText/);
  assert.doesNotMatch(mention, /emails/);
  const plainStart = app.indexOf('className="assistant-plain"');
  const plainBranch = app.slice(plainStart, plainStart + 500);
  assert.match(plainBranch, /streaming/);
  assert.doesNotMatch(plainBranch, /emails/);
});

test("completed assistant markdown turns emails on, and docs stay put", () => {
  assert.match(body, /emails=\{completed\}/);
  assert.match(body, /emails=\{emails\}/);
  assert.match(body, /splitWebUrls\(text, \{ streaming, emails \}\)/);
  assert.match(src, /export function isExtendedEmail/);
  assert.match(src, /export function emailHref/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /static func isExtendedEmail/);
  assert.match(swift, /static func emailHref/);
  assert.match(swift, /emails: Bool = false/);
  assert.match(swift, /emails: !streaming/);
  assert.match(markdown, /WebLinks.applyingLinks\(parsed, streaming: false\)/);
  assert.match(components, /WebLinks.split\(text, streaming: false\)/);
  assert.doesNotMatch(components, /emails: true/);
  assert.doesNotMatch(plain, /emails: true/);
  assert.doesNotMatch(swift, /xmpp/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.45 /);
  assert.match(spec, /## 145\. v1\.45/);
  assert.match(spec, /GFM email autolinks in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_email\.py/);
  assert.match(pkg, /markdownEmail\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
});
