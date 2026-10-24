// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unicodeCaseFold } from "./markdownCaseFold.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownReferenceLink.ts"), "utf8");
const fold = readFileSync(join(here, "markdownCaseFold.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownReferenceLink.swift"),
  "utf8",
);
const foldSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownCaseFold.swift"),
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
  "v1.81 CommonMark link reference definition edge cases in completed assistant replies";
const URL = "https://example.com/u";

function resolved(text: string): string {
  return resolveReferenceLinks(text, true);
}

function links(text: string, label: string): boolean {
  return resolved(text).includes(`[${label}](${URL})`);
}

test("multi-line labels, whitespace, and the first definition already match", () => {
  assert.equal(links("[foo\nbar]: " + URL + "\n\n[foo bar]\n", "foo bar"), true);
  const wrapped = resolved("[foo bar]: " + URL + "\n\n[foo\nbar]\n");
  assert.match(wrapped, /\[foo\nbar\]\(https:\/\/example\.com\/u\)/);
  assert.equal(wrapped.includes("[foo bar]:"), false);
  assert.equal(links("[foo \n bar]: " + URL + "\n\n[foo bar]\n", "foo bar"), true);
  assert.equal(links("[foo\tbar]: " + URL + "\n\n[foo bar]\n", "foo bar"), true);
  const first = resolved(`[foo]: ${URL}1\n[foo]: ${URL}2\n\n[foo]\n`);
  assert.match(first, /\[foo\]\(https:\/\/example\.com\/u1\)/);
  assert.equal(first.includes(`${URL}2`), false);
  assert.equal(first.includes("[foo]:"), false);
});

test("a definition cannot interrupt an open paragraph", () => {
  const para = `Foo\n[bar]: ${URL}\n\n[bar]\n`;
  assert.equal(resolved(para).includes(`[bar](${URL})`), false);
  assert.match(resolved(para), /\[bar\]: https:\/\/example\.com\/u/);
  const mid = `aaa\n[foo]: ${URL}\nbbb\n`;
  assert.equal(resolved(mid), mid.replace(/\r\n/g, "\n"));
  const lazyQuote = `> foo\n[bar]: ${URL}\n\n[bar]\n`;
  assert.equal(resolved(lazyQuote).includes(`[bar](${URL})`), false);
  const marked = `> foo\n> [bar]: ${URL}\n\n[bar]\n`;
  assert.equal(resolved(marked).includes(`[bar](${URL})`), false);
  const lazyList = `- foo\n[bar]: ${URL}\n\n[bar]\n`;
  assert.equal(resolved(lazyList).includes(`[bar](${URL})`), false);
  const indented = `- foo\n  [bar]: ${URL}\n\n[bar]\n`;
  assert.equal(resolved(indented).includes(`[bar](${URL})`), false);
  const multi = `Foo\n[bar\nbaz]: ${URL}\n\n[bar baz]\n`;
  assert.equal(resolved(multi).includes(`[bar baz](${URL})`), false);
  const equals = `===\n[bar]: ${URL}\n\n[bar]\n`;
  assert.equal(resolved(equals).includes(`[bar](${URL})`), false);
});

test("a closed paragraph still accepts a definition", () => {
  assert.equal(links(`Foo\n\n[bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`# H\n[bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`***\n[bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`Foo\n---\n[bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`Foo\n===\n[bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`> foo\n>\n> [bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`> foo\n\n[bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`- foo\n\n[bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  assert.equal(links(`   [bar]: ${URL}\n\n[bar]\n`, "bar"), true);
  const fence = "```\n[bar]: " + URL + "\n```\n\n[bar]\n";
  assert.equal(resolved(fence).includes(`[bar](${URL})`), false);
  assert.match(resolved(fence), /```\n\[bar\]:/);
  const html = `<div>\n[bar]: ${URL}\n</div>\n\n[bar]\n`;
  assert.equal(resolved(html).includes(`[bar](${URL})`), false);
  assert.match(resolved(html), /<div>\n\[bar\]:/);
});

test("labels use the Unicode case fold and may be 1000 characters", () => {
  assert.equal(unicodeCaseFold("ẞ"), "ss");
  assert.equal(unicodeCaseFold("ß"), "ss");
  assert.equal(unicodeCaseFold("ς"), "σ");
  assert.equal(unicodeCaseFold("Σ"), "σ");
  assert.equal(unicodeCaseFold("ﬁ"), "fi");
  assert.equal(links(`[ẞ]: ${URL}\n\n[SS]\n`, "SS"), true);
  assert.equal(links(`[SS]: ${URL}\n\n[ß]\n`, "ß"), true);
  assert.equal(links(`[ς]: ${URL}\n\n[Σ]\n`, "Σ"), true);
  assert.equal(links(`[ﬁ]: ${URL}\n\n[fi]\n`, "fi"), true);
  const ok = "a".repeat(1000);
  assert.equal(links(`[${ok}]: ${URL}\n\n[${ok}]\n`, ok), true);
  const over = "b".repeat(1001);
  const tooLong = resolved(`[${over}]: ${URL}\n\n[${over}]\n`);
  assert.equal(tooLong.includes(`[${over}](${URL})`), false);
  assert.match(tooLong, /\[b{20,}\]: https:\/\/example\.com\/u/);
  assert.equal(resolveReferenceLinks(`[ẞ]: ${URL}\n\n[SS]\n`, false).includes("[SS]("), false);
});

test("docs, CI, and OpenAPI stay on this cut", () => {
  assert.match(src, /v1\.81/);
  assert.match(src, /closesOpenParagraph/);
  assert.match(src, /unicodeCaseFold/);
  assert.match(src, /raw\.length > 1000/);
  assert.match(fold, /0x00DF: "ss"/);
  assert.match(fold, /0x1E9E: "ss"/);
  assert.match(fold, /0x03C2: "σ"/);
  assert.match(fold, /0xFB01: "fi"/);
  assert.match(swift, /v1\.81/);
  assert.match(swift, /closesOpenParagraph/);
  assert.match(swift, /MarkdownCaseFold\.fold/);
  assert.match(swift, /raw\.count > 1000/);
  assert.match(foldSwift, /0x00DF: "ss"/);
  assert.match(foldSwift, /0x03C2: "σ"/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.81 /);
  assert.match(spec, /## 181\. v1\.81/);
  assert.match(spec, /link reference definition edge cases/i);
  assert.match(ci, /test_ios_markdown_reference_edge\.py/);
  assert.match(pkg, /markdownReferenceEdge\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(src.includes("computerPane"), false);
  assert.equal(swift.includes("UIPasteboard"), false);
  assert.equal(swift.includes("/v1/"), false);
});
