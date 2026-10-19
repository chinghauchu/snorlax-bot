// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LINK_STATUS_MAX,
  currentLinkStatus,
  linkStatusClearFocus,
  linkStatusClearHover,
  linkStatusFocus,
  linkStatusHover,
  linkStatusLabel,
  resetLinkStatus,
  shownLinkStatus,
} from "./linkStatus.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const pill = readFileSync(join(here, "linkStatusPill.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtime = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const ios = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "LinkPreview.swift"),
  "utf8",
);

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("short destinations stay whole and long ones truncate in the middle", () => {
  const short = "https://example.com/docs";
  assert.equal(linkStatusLabel(short), short);
  assert.equal(linkStatusLabel(""), "");

  const path = "/very/long/path".repeat(8);
  const url = `https://example.com${path}`;
  assert.ok(url.length > LINK_STATUS_MAX);
  const label = linkStatusLabel(url);
  assert.equal(label.length, LINK_STATUS_MAX);
  const ellipsis = label.indexOf("…");
  assert.ok(ellipsis > 8, "ellipsis is not a prefix");
  assert.ok(label.length - ellipsis > 8, "ellipsis is not a suffix");
  assert.equal(label.slice(0, ellipsis), url.slice(0, ellipsis));
  const tail = label.slice(ellipsis + 1);
  assert.equal(tail, url.slice(url.length - tail.length));
  assert.equal(linkStatusLabel("https://example.com/a", 1), "…");
  assert.equal(linkStatusLabel("abcd", 0), "");
});

test("hover wins, focus remains after mouse leave, a foreign id does not clear", () => {
  resetLinkStatus();
  assert.equal(shownLinkStatus(null, null), null);
  assert.equal(shownLinkStatus("https://a.example/one", null), "https://a.example/one");
  assert.equal(shownLinkStatus(null, "https://b.example/two"), "https://b.example/two");
  assert.equal(
    shownLinkStatus("https://a.example/one", "https://b.example/two"),
    "https://a.example/one",
  );

  assert.equal(currentLinkStatus(), null);
  linkStatusHover(1, "https://a.example/one");
  assert.equal(currentLinkStatus(), "https://a.example/one");
  linkStatusFocus(2, "https://b.example/two");
  assert.equal(currentLinkStatus(), "https://a.example/one");
  linkStatusClearHover(9);
  assert.equal(currentLinkStatus(), "https://a.example/one");
  linkStatusClearHover(1);
  assert.equal(currentLinkStatus(), "https://b.example/two");
  linkStatusClearFocus(2);
  assert.equal(currentLinkStatus(), null);
  linkStatusHover(3, "");
  assert.equal(currentLinkStatus(), null);
  resetLinkStatus();
});

test("completed message links report the destination; a click still opens the browser", () => {
  assert.match(body, /preview=\{completed\}/);
  assert.match(body, /preview=\{!streaming\}/);
  assert.match(body, /onMouseEnter=\{reveal \? \(\) => linkStatusHover\(id, url\)/);
  assert.match(body, /onMouseLeave=\{reveal \? \(\) => linkStatusClearHover\(id\)/);
  assert.match(body, /:focus-visible/);
  assert.match(body, /linkStatusFocus\(id, url\)/);
  assert.match(body, /onBlur=\{reveal \? \(\) => linkStatusClearFocus\(id\)/);
  assert.match(body, /event\.preventDefault\(\)/);
  assert.match(body, /openOsBrowser\(url\)/);
  assert.match(body, /href=\{linkHref\(piece\.value\)\}/);
  assert.match(pill, /linkStatusLabel\(url\)/);
  assert.match(pill, /aria-label=\{url\}/);
  assert.match(pill, /role="status"/);
  assert.doesNotMatch(pill, /openOsBrowser/);
  assert.doesNotMatch(pill, /transition/);

  const colStart = app.indexOf('className="transcript-col"');
  const colEnd = app.indexOf('className="composer"', colStart);
  const col = app.slice(colStart, colEnd);
  assert.match(col, /<LinkStatusPill \/>/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(userStart, userEnd);
  assert.match(userBranch, /<MentionText/);
  assert.match(userBranch, /links/);
  const plainStart = app.indexOf('className="assistant-plain"');
  const plainEnd = app.indexOf("showAssistantCopy", plainStart);
  const plainBranch = app.slice(plainStart, plainEnd);
  assert.match(plainBranch, /streaming/);
  assert.match(app, /<MarkdownBody/);

  const chrome = block(".link-status");
  assert.match(chrome, /position:\s*absolute/);
  assert.match(chrome, /left:\s*12px/);
  assert.match(chrome, /bottom:\s*12px/);
  assert.match(chrome, /color:\s*var\(--text-muted\)/);
  assert.match(chrome, /font-size:\s*12px/);
  assert.match(chrome, /border-radius:\s*999px/);
  assert.match(chrome, /pointer-events:\s*none/);
  assert.match(chrome, /transition:\s*none/);
  assert.match(chrome, /animation:\s*none/);
  assert.match(ios, /url\.absoluteString/);
  assert.match(ios, /"Open Link"/);
  assert.match(ios, /"Copy Link"/);
});

test("docs stay on OpenAPI 0.18.0 and do not reintroduce computerPane", () => {
  assert.match(roadmap, /v1\.35 link destination before open/);
  assert.match(roadmap, /\/ v1\.35 /);
  assert.match(spec, /## 135\. v1\.35/);
  assert.match(spec, /Open Link/);
  assert.match(spec, /Copy Link/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtime, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.match(pkg, /linkStatus\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
