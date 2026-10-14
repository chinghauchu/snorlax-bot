// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isSafeWebUrl, splitWebUrls, type WebPiece } from "./linkify.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const plain = readFileSync(join(here, "midStreamPlaintext.ts"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);

function roundTrip(text: string, streaming = false): WebPiece[] {
  const pieces = splitWebUrls(text, { streaming });
  assert.equal(
    pieces.map((piece) => piece.value).join(""),
    text,
    `pieces must rebuild ${JSON.stringify(text)}`,
  );
  return pieces;
}

function linksOf(text: string, streaming = false): string[] {
  return roundTrip(text, streaming)
    .filter((piece) => piece.type === "link")
    .map((piece) => piece.value);
}

test("http and https are links; other schemes stay plain", () => {
  assert.equal(isSafeWebUrl("https://example.com/a"), true);
  assert.equal(isSafeWebUrl("http://example.com"), true);
  assert.equal(isSafeWebUrl("HTTP://Example.COM/a"), true);
  assert.equal(isSafeWebUrl("javascript:alert(1)"), false);
  assert.equal(isSafeWebUrl("file:///etc/passwd"), false);
  assert.equal(isSafeWebUrl("data:text/html,hi"), false);
  assert.equal(isSafeWebUrl("ftp://example.com/a"), false);
  assert.equal(isSafeWebUrl("/relative"), false);
  assert.equal(isSafeWebUrl(undefined), false);

  assert.deepEqual(linksOf("see https://example.com/a and http://example.com/b"), [
    "https://example.com/a",
    "http://example.com/b",
  ]);
  assert.deepEqual(linksOf("HTTP://Example.COM/Path"), ["HTTP://Example.COM/Path"]);
  assert.deepEqual(linksOf("javascript:alert(1)"), []);
  assert.deepEqual(linksOf("file:///etc/passwd"), []);
  assert.deepEqual(linksOf("data:text/html,hi"), []);
  assert.deepEqual(linksOf("ftp://example.com/a"), []);
  assert.deepEqual(linksOf("www.example.com"), []);
  assert.deepEqual(linksOf("see javascript:alert(1) now"), []);
});

test("trailing punctuation and quotes stay outside the link", () => {
  assert.deepEqual(linksOf("see https://example.com/a."), ["https://example.com/a"]);
  assert.deepEqual(linksOf("see https://example.com/a, please"), [
    "https://example.com/a",
  ]);
  assert.deepEqual(linksOf("see (https://example.com/a)"), ["https://example.com/a"]);
  assert.deepEqual(linksOf('see "https://example.com/a".'), ["https://example.com/a"]);
  assert.deepEqual(linksOf("see 'http://example.com/a'."), ["http://example.com/a"]);
  assert.deepEqual(linksOf("https://example.com/a)."), ["https://example.com/a"]);
  assert.deepEqual(linksOf("http://example.com,)."), ["http://example.com"]);
  assert.deepEqual(
    linksOf("https://en.wikipedia.org/wiki/URL_(disambiguation)"),
    ["https://en.wikipedia.org/wiki/URL_(disambiguation)"],
  );
  assert.deepEqual(linksOf("https://example.com/a(b)."), ["https://example.com/a(b)"]);
  const curly = "see https://example.com/a\u201d next";
  assert.deepEqual(linksOf(curly), ["https://example.com/a"]);
  assert.match(roundTrip(curly).map((piece) => piece.value).join(""), /\u201d/);
});

test("inline code and fenced code stay plain", () => {
  assert.deepEqual(
    linksOf("use `https://in.example/a` then http://out.example/b."),
    ["http://out.example/b"],
  );
  assert.deepEqual(
    linksOf("use ``https://in.example/a`` then https://out.example/b"),
    ["https://out.example/b"],
  );
  const fenced = [
    "before https://out.example/a",
    "```",
    "https://in.example/b",
    "```",
    "after http://out.example/c.",
  ].join("\n");
  assert.deepEqual(linksOf(fenced), [
    "https://out.example/a",
    "http://out.example/c",
  ]);
  const lang = ["```js", 'const u = "https://in.example/d"', "```", "https://out.example/e"].join(
    "\n",
  );
  assert.deepEqual(linksOf(lang), ["https://out.example/e"]);
  const tilde = ["~~~", "https://in.example/f", "~~~", "https://out.example/g"].join("\n");
  assert.deepEqual(linksOf(tilde), ["https://out.example/g"]);
  const unclosed = ["see https://out.example/a", "```js", "https://in.example/b"].join("\n");
  assert.deepEqual(linksOf(unclosed), ["https://out.example/a"]);
  assert.deepEqual(
    linksOf("a stray ` backtick then https://example.com/a"),
    ["https://example.com/a"],
  );
});

test("a mid-stream URL at the end of the buffer stays plain", () => {
  assert.deepEqual(linksOf("see https://example.com/partial", true), []);
  assert.deepEqual(linksOf("see https://example.com.", true), []);
  assert.deepEqual(linksOf("https://example.com/partial", true), []);
  assert.deepEqual(linksOf("see https://example.com/done next", true), [
    "https://example.com/done",
  ]);
  assert.deepEqual(linksOf("see https://example.com/done.", false), [
    "https://example.com/done",
  ]);
  assert.deepEqual(
    linksOf("https://done.example/a then https://partial.example/b", true),
    ["https://done.example/a"],
  );
  const openFence = "```\nhttps://in.example/still";
  assert.deepEqual(linksOf(openFence, true), []);
  assert.deepEqual(linksOf("`https://in.example/a` https://out.example/b", true), []);
  assert.deepEqual(
    linksOf("`https://in.example/a` https://out.example/b next", true),
    ["https://out.example/b"],
  );
});

test("desktop wires links on user and assistant bubbles, not tool lines", () => {
  assert.match(body, /isSafeWebUrl/);
  assert.match(body, /splitWebUrls/);
  assert.match(body, /openOsBrowser/);
  assert.match(body, /function InlineCode/);
  assert.match(body, /child\.type === InlineCode/);
  assert.match(body, /child\.type === MdLink/);
  assert.match(body, /<HttpsText/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(userStart, userEnd);
  assert.match(userBranch, /<MentionText/);
  assert.match(userBranch, /links/);
  assert.doesNotMatch(userBranch, /MarkdownBody/);
  const plainStart = app.indexOf('className="assistant-plain"');
  const plainEnd = app.indexOf("showAssistantCopy", plainStart);
  const plainBranch = app.slice(plainStart, plainEnd);
  assert.match(plainBranch, /<HttpsText/);
  assert.match(plainBranch, /streaming/);
  assert.doesNotMatch(plainBranch, /<MarkdownBody/);
  assert.match(app, /<MarkdownBody/);
  const toolStart = app.indexOf(") : isToolLine(message) ? (");
  const toolEnd = app.indexOf("isWidget(message)", toolStart);
  const toolBranch = app.slice(toolStart, toolEnd);
  assert.match(toolBranch, /<FindText/);
  assert.doesNotMatch(toolBranch, /HttpsText/);
  assert.doesNotMatch(toolBranch, /splitWebUrls/);
  assert.match(plain, /no live markdown, mermaid, or math/);
  assert.match(roadmap, /v0\.82 bare http\(s\) links/);
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
