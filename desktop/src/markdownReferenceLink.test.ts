// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
import { isSafeWebUrl } from "./linkify.ts";
import { extractFootnotes } from "./markdownFootnote.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { splitMarkdownTables } from "./markdownTable.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownReferenceLink.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownReferenceLink.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
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
  "v1.39 CommonMark reference-style links in completed assistant replies";

test("full, collapsed, and shortcut links resolve and the definition is hidden", () => {
  const source = [
    "See [full][ref], a collapsed [ref][], and a shortcut [ref].",
    "",
    '[ref]: https://example.com/docs "Optional title"',
  ].join("\n");
  const resolved = resolveReferenceLinks(source, true);
  assert.equal(resolved.includes("[ref]:"), false);
  assert.equal(
    resolved,
    'See [full](https://example.com/docs "Optional title"), a collapsed [ref](https://example.com/docs "Optional title"), and a shortcut [ref](https://example.com/docs "Optional title").\n\n',
  );
  assert.deepEqual(splitAssistantBubbles(resolved, true), [
    'See [full](https://example.com/docs "Optional title"), a collapsed [ref](https://example.com/docs "Optional title"), and a shortcut [ref](https://example.com/docs "Optional title").',
  ]);
  assert.equal(isSafeWebUrl("https://example.com/docs"), true);
});

test("labels match case-insensitively and whitespace collapses", () => {
  const source = "Read [Foo   Bar].\n\n[foo bar]: https://example.com/foo";
  assert.equal(
    resolveReferenceLinks(source, true),
    "Read [Foo   Bar](https://example.com/foo).\n\n",
  );
  const folded = "See [REF].\n\n[Ref]: <https://example.com/ref>";
  assert.equal(
    resolveReferenceLinks(folded, true),
    "See [REF](https://example.com/ref).\n\n",
  );
});

test("a later duplicate definition loses and both lines stay hidden", () => {
  const source = [
    "Go [ref].",
    "",
    "[ref]: https://example.com/first",
    "[ref]: https://example.com/second",
  ].join("\n");
  const resolved = resolveReferenceLinks(source, true);
  assert.equal(resolved.includes("second"), false);
  assert.equal(resolved.includes("[ref]:"), false);
  assert.match(resolved, /\[ref\]\(https:\/\/example\.com\/first\)/);
});

test("unresolved references stay literal and an unused definition is hidden", () => {
  assert.equal(
    resolveReferenceLinks("See [missing] and [also][nope].", true),
    "See [missing] and [also][nope].",
  );
  const unused = "Hello.\n\n[other]: https://example.com/other\n";
  const resolved = resolveReferenceLinks(unused, true);
  assert.equal(resolved.includes("[other]:"), false);
  assert.match(resolved, /^Hello\.\n/);
  const onlyMissing = "See [missing].\n\n[ref]: https://example.com/r\n";
  const partial = resolveReferenceLinks(onlyMissing, true);
  assert.match(partial, /See \[missing\]\./);
  assert.equal(partial.includes("[ref]:"), false);
});

test("footnotes stay footnotes and are not reference links", () => {
  const source = [
    "See [^1] and [docs][ref].",
    "",
    "[^1]: the note",
    "[ref]: https://example.com/r",
  ].join("\n");
  const resolved = resolveReferenceLinks(source, true);
  assert.match(resolved, /See \[\^1\] and \[docs\]\(https:\/\/example\.com\/r\)\./);
  assert.match(resolved, /\[\^1\]: the note/);
  assert.equal(resolved.includes("[ref]:"), false);
  const notes = extractFootnotes(resolved, true);
  assert.equal(notes.notes[0]?.text, "the note");
  assert.equal(notes.notes.length, 1);
  const owned = "Go[^1].\n\n[^1]: alpha\n  [ref]: https://example.com/hidden\n";
  const kept = resolveReferenceLinks(owned, true);
  assert.match(kept, /\[\^1\]: alpha\n {2}\[ref\]: https:\/\/example\.com\/hidden/);
  const extracted = extractFootnotes(kept, true);
  assert.match(extracted.notes[0]?.text ?? "", /\[ref\]: https:\/\/example\.com\/hidden/);
});

test("code spans, fences, and math are not link text", () => {
  const span = "Use `[ref]` and [ref].\n\n[ref]: https://example.com/r";
  const spanOut = resolveReferenceLinks(span, true);
  assert.match(spanOut, /`\[ref\]`/);
  assert.match(spanOut, /and \[ref\]\(https:\/\/example\.com\/r\)/);

  const fence = [
    "```",
    "[ref]",
    "[ref]: https://example.com/hidden",
    "```",
    "",
    "See [ref].",
    "",
    "[ref]: https://example.com/real",
  ].join("\n");
  const fenceOut = resolveReferenceLinks(fence, true);
  assert.match(fenceOut, /```\n\[ref\]\n\[ref\]: https:\/\/example\.com\/hidden\n```/);
  assert.match(fenceOut, /See \[ref\]\(https:\/\/example\.com\/real\)/);
  assert.equal(fenceOut.includes("https://example.com/hidden") , true);

  const math = "$$\n[ref]\n$$\n\n[ref]: https://example.com/m";
  const mathOut = resolveReferenceLinks(math, true);
  assert.match(mathOut, /\$\$\n\[ref\]\n\$\$/);
  assert.equal(mathOut.includes("[ref]:"), false);

  const inline = "Use \\( [ref] \\) and [ref].\n\n[ref]: https://example.com/m";
  const inlineOut = resolveReferenceLinks(inline, true);
  assert.match(inlineOut, /\\\( \[ref\] \\\)/);
  assert.match(inlineOut, /and \[ref\]\(https:\/\/example\.com\/m\)/);
});

test("task lists, tables, inline links, and images keep their shape", () => {
  const tasks = [
    "- [x] done [docs][ref]",
    "- [ ] open",
    "* [X] also",
    "",
    "[x]: https://example.com/x",
    "[ref]: https://example.com/r",
  ].join("\n");
  const taskOut = resolveReferenceLinks(tasks, true);
  assert.match(taskOut, /^- \[x\] done \[docs\]\(https:\/\/example\.com\/r\)/m);
  assert.match(taskOut, /^- \[ \] open/m);
  assert.match(taskOut, /^\* \[X\] also/m);
  assert.equal(taskOut.includes("[x]:"), false);
  const blocks = splitQuoteAndTasks(taskOut, true);
  const taskBlock = blocks.find((block) => block.type === "tasks");
  assert.ok(taskBlock && taskBlock.type === "tasks");
  assert.equal(taskBlock.items[0]?.checked, true);
  assert.match(taskBlock.items[0]?.text ?? "", /\[docs\]\(https:\/\/example\.com\/r\)/);
  assert.equal(taskBlock.items[1]?.checked, false);

  const table = [
    "| Item | Link |",
    "| --- | --- |",
    "| A | [docs][ref] |",
    "",
    "[ref]: https://example.com/r",
  ].join("\n");
  const tableOut = resolveReferenceLinks(table, true);
  assert.match(tableOut, /\| A \| \[docs\]\(https:\/\/example\.com\/r\) \|/);
  const parts = splitMarkdownTables(tableOut, true);
  assert.equal(parts.some((part) => part.type === "table"), true);

  const inline = "[ref](https://example.com/inline)\n\n[ref]: https://example.com/def\n";
  const inlineOut = resolveReferenceLinks(inline, true);
  assert.match(inlineOut, /\[ref\]\(https:\/\/example\.com\/inline\)/);
  assert.equal(inlineOut.includes("example.com/def"), false);

  const image = "![alt][ref]\n\n[ref]: https://example.com/pic";
  assert.equal(
    resolveReferenceLinks(image, true),
    "![alt](https://example.com/pic)\n\n",
  );
  const inlineImage = "![alt](https://example.com/pic)\n\n[ref]: https://example.com/other";
  const imageOut = resolveReferenceLinks(inlineImage, true);
  assert.match(imageOut, /!\[alt\]\(https:\/\/example\.com\/pic\)/);
  assert.equal(imageOut.includes("[ref]:"), false);
});

test("blockquote definitions are hidden and escapes stay literal", () => {
  const quote = [
    "> See [docs][ref].",
    ">",
    '> [ref]: https://example.com/q "title"',
  ].join("\n");
  const quoteOut = resolveReferenceLinks(quote, true);
  assert.match(quoteOut, /> See \[docs\]\(https:\/\/example\.com\/q "title"\)\./);
  assert.equal(quoteOut.includes("[ref]:"), false);

  const escaped = "Literal \\[ref] here.\n\n[ref]: https://example.com/r\n";
  const escapedOut = resolveReferenceLinks(escaped, true);
  assert.match(escapedOut, /Literal \\\[ref\] here\./);
  assert.equal(escapedOut.includes("[ref]:"), false);
});

test("destination may sit on the next line and titles use quotes or parentheses", () => {
  const next = "[ref]:\nhttps://example.com/next\n\nSee [ref].";
  assert.match(
    resolveReferenceLinks(next, true),
    /See \[ref\]\(https:\/\/example\.com\/next\)/,
  );
  const single = "See [ref].\n\n[ref]: https://example.com/s 'Single title'";
  assert.match(
    resolveReferenceLinks(single, true),
    /\[ref\]\(https:\/\/example\.com\/s "Single title"\)/,
  );
  const paren = "See [ref].\n\n[ref]: https://example.com/p (Paren title)";
  assert.match(
    resolveReferenceLinks(paren, true),
    /\[ref\]\(https:\/\/example\.com\/p "Paren title"\)/,
  );
  const angled = "[docs][ref]\n\n[ref]: <https://example.com/a(b)>";
  assert.match(
    resolveReferenceLinks(angled, true),
    /\[docs\]\(<https:\/\/example\.com\/a\(b\)>\)/,
  );
});

test("full reference beats shortcut, and a missing second label stays literal", () => {
  const both = "[foo][bar]\n\n[foo]: https://example.com/foo\n[bar]: https://example.com/bar";
  assert.match(
    resolveReferenceLinks(both, true),
    /^\[foo\]\(https:\/\/example\.com\/bar\)/,
  );
  // cmark: a following label that is not defined does not fall back to the shortcut.
  const onlyFoo = "[foo][bar]\n\n[foo]: https://example.com/foo";
  assert.equal(resolveReferenceLinks(onlyFoo, true).includes("[foo][bar]"), true);
  assert.equal(resolveReferenceLinks(onlyFoo, true).includes("example.com/foo"), false);
});

test("streaming and messages without a definition stay byte-for-byte", () => {
  const live = "See [ref].\n\n[ref]: https://example.com/r";
  assert.equal(resolveReferenceLinks(live, false), live);
  const plain = "Hello **there**\n\n- [x] done\n\nhttps://example.com\n";
  assert.equal(resolveReferenceLinks(plain, true), plain);
  const once = resolveReferenceLinks(live, true);
  assert.equal(resolveReferenceLinks(once, true), once);
});

test("unsafe destinations still rewrite so the existing scheme check can drop them", () => {
  const source = "Click [here][js].\n\n[js]: javascript:alert(1)";
  const resolved = resolveReferenceLinks(source, true);
  assert.match(resolved, /\[here\]\(<javascript:alert\(1\)>\)/);
  assert.equal(isSafeWebUrl("javascript:alert(1)"), false);
  assert.equal(resolved.includes("[js]:"), false);
});

test("desktop and iOS wire the resolver ahead of footnotes", () => {
  assert.match(src, /export function resolveReferenceLinks/);
  assert.match(src, /completed: false/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/MarkdownReferenceLink.swift`/);
  assert.match(swift, /static func resolve\(_ text: String, completed: Bool\) -> String/);
  assert.match(swift, /if !completed \|\| text.isEmpty \|\| !text.contains\("\["\)/);
  assert.match(swift, /Keep in lockstep with `desktop\/src\/markdownReferenceLink.ts`/);
  assert.match(app, /resolveReferenceLinks\(body, completed\)/);
  assert.match(app, /resolveReferenceLinks\(replyBody, completed\)/);
  assert.match(app, /extractFootnotes\(linked, completed\)/);
  assert.match(body, /<MdLink href=\{href\} title=\{title\} preview=\{completed\}>/);
  assert.match(body, /className="md-link"/);
  assert.match(body, /isSafeWebUrl/);
  assert.match(chat, /MarkdownReferenceLink\.resolve\(message\.displayContent, completed: completed\)/);
  assert.match(chat, /MarkdownSplit\.bubbles\(in: message\.displayContent, completed: completed\)/);
  assert.match(pkg, /markdownReferenceLink\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_reference_link\.py/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.39 /);
  assert.match(spec, /## 139\. v1\.39/);
  assert.match(spec, /reference-style links in completed assistant replies/i);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
});
