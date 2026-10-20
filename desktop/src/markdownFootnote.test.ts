// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
import {
  FOOTNOTE_SHOW,
  FOOTNOTES_TITLE,
  extractFootnotes,
  footnoteAnimates,
  footnoteBackLabel,
  footnoteFindTexts,
  footnoteRefLabel,
  footnoteSelector,
  footnoteToken,
  plainFootnoteText,
  splitFootnoteTokens,
} from "./markdownFootnote.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownFootnote.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownFootnote.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const quote = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QuoteSelection.swift"),
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

const PHRASE = "v1.38 GFM footnotes in completed assistant replies";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("a matched reference becomes a marker and the definition leaves the body", () => {
  const extracted = extractFootnotes("See[^1].\n\n[^1]: note text", true);
  assert.equal(extracted.notes.length, 1);
  assert.equal(extracted.notes[0]?.label, "1");
  assert.equal(extracted.notes[0]?.number, 1);
  assert.equal(extracted.notes[0]?.text, "note text");
  assert.equal(extracted.text.includes("[^1]:"), false);
  assert.equal(extracted.text.includes(footnoteToken(1)), true);
  assert.deepEqual(splitAssistantBubbles(extracted.text, true), [
    `See${footnoteToken(1)}.`,
  ]);
  const pieces = splitFootnoteTokens(`See${footnoteToken(1)}.`);
  assert.deepEqual(pieces, [
    { type: "text", value: "See" },
    { type: "ref", number: 1 },
    { type: "text", value: "." },
  ]);
});

test("definitions after a blank line stay with the message, not a stray bubble", () => {
  const srcText = "See the note[^1].\n\nMore text.\n\n[^1]: the note";
  const extracted = extractFootnotes(srcText, true);
  assert.deepEqual(splitAssistantBubbles(extracted.text, true), [
    `See the note${footnoteToken(1)}.`,
    "More text.",
  ]);
  assert.equal(extracted.notes[0]?.text, "the note");
  const find = footnoteFindTexts(
    splitAssistantBubbles(extracted.text, true),
    extracted.notes,
  );
  assert.match(find[1] ?? "", /1\. the note/);
});

test("numbering follows the first reference and repeats share a number", () => {
  const extracted = extractFootnotes(
    "Second[^b] then first[^a] and again[^b].\n\n[^a]: alpha\n\n[^b]: beta",
    true,
  );
  assert.deepEqual(
    extracted.notes.map((note) => [note.label, note.number, note.text]),
    [
      ["b", 1, "beta"],
      ["a", 2, "alpha"],
    ],
  );
  const token1 = footnoteToken(1);
  assert.equal(extracted.text.split(token1).length - 1, 2);
  assert.equal(extracted.text.includes(footnoteToken(2)), true);
  assert.equal(extracted.text.includes("[^a]:"), false);
  assert.equal(extracted.text.includes("[^b]:"), false);
});

test("unmatched references and definitions stay plain text", () => {
  const orphanRef = extractFootnotes("See[^9] today.", true);
  assert.deepEqual(orphanRef.notes, []);
  assert.equal(orphanRef.text, "See[^9] today.");
  const orphanDef = extractFootnotes("Hello.\n\n[^4]: nobody", true);
  assert.deepEqual(orphanDef.notes, []);
  assert.equal(orphanDef.text, "Hello.\n\n[^4]: nobody");
  const duplicate = extractFootnotes(
    "See[^1].\n\n[^1]: first\n\n[^1]: second",
    true,
  );
  assert.equal(duplicate.notes.length, 1);
  assert.equal(duplicate.notes[0]?.text, "first");
  assert.match(duplicate.text, /\[\^1\]: second/);
});

test("code spans, fences, and math keep footnotes literal", () => {
  const span = extractFootnotes("Use `[^1]` here[^1].\n\n[^1]: note", true);
  assert.match(span.text, /`\[\^1\]`/);
  assert.match(span.text, new RegExp(footnoteToken(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(span.text.includes("[^1]:"), false);

  const fence = extractFootnotes(
    "```js\n[^1]\n[^1]: inside\n```\n\nSee[^1].\n\n[^1]: outside",
    true,
  );
  assert.match(fence.text, /```js\n\[\^1\]\n\[\^1\]: inside\n```/);
  assert.match(fence.text, new RegExp(`See${footnoteToken(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(fence.notes[0]?.text, "outside");

  const onlyFence = extractFootnotes("```\n[^1]\n```\n\n[^1]: hidden", true);
  assert.deepEqual(onlyFence.notes, []);
  assert.match(onlyFence.text, /\[\^1\]: hidden/);

  const math = extractFootnotes("$$ \n[^1]\n$$\n\n[^1]: no", true);
  assert.deepEqual(math.notes, []);
  assert.match(math.text, /\[\^1\]: no/);

  const inline = extractFootnotes("Use \\( [^1] \\) now.\n\n[^1]: no", true);
  assert.deepEqual(inline.notes, []);
});

test("multiline notes dedent and a following paragraph stays in the body", () => {
  const extracted = extractFootnotes(
    "Go[^note].\n\n[^note]: alpha\n  beta\n\nNext paragraph.",
    true,
  );
  assert.equal(extracted.notes[0]?.text, "alpha\nbeta");
  assert.deepEqual(splitAssistantBubbles(extracted.text, true), [
    `Go${footnoteToken(1)}.`,
    "Next paragraph.",
  ]);
  const indented = extractFootnotes("A[^1].\n\n[^1]:\n    paragraph", true);
  assert.equal(indented.notes[0]?.text, "paragraph");
});

test("escaped references and streaming stay untouched", () => {
  const escaped = extractFootnotes("Literal\\[^1] here.\n\n[^1]: no", true);
  assert.deepEqual(escaped.notes, []);
  assert.match(escaped.text, /\\\[\^1\]/);
  const live = "See[^1].\n\n[^1]: note";
  assert.deepEqual(extractFootnotes(live, false), { text: live, notes: [] });
  assert.equal(footnoteAnimates(false), false);
  assert.equal(footnoteAnimates(true), false);
  assert.equal(plainFootnoteText(`say ${footnoteToken(2)}`), "say 2");
  assert.equal(footnoteRefLabel(3), "Footnote 3");
  assert.equal(footnoteBackLabel(3), "Back to reference 3");
  assert.equal(FOOTNOTES_TITLE, "Footnotes");
  assert.equal(FOOTNOTE_SHOW, "Show footnote");
  assert.match(footnoteSelector("msg-1", 2, "note"), /data-fn-note="msg-1"/);
  assert.match(footnoteSelector("msg-1", 2, "ref"), /data-fn-ref="msg-1"/);
  assert.match(footnoteSelector("msg-1", 2, "ref"), /data-fn-number="2"/);
});

test("no matched pair leaves surrounding markdown unchanged", () => {
  const sample = "Hello **there**\n\nhttps://example.com\n\n- item";
  assert.equal(extractFootnotes(sample, true).text, sample);
  assert.deepEqual(footnoteFindTexts(["a", "b"], []), ["a", "b"]);
});

test("desktop renders a superscript marker, a back-link, and a muted list", () => {
  assert.match(body, /splitFootnoteTokens/);
  assert.match(body, /className="md-fn-ref"/);
  assert.match(body, /className="md-footnotes"/);
  assert.match(body, /className="md-fn-back"/);
  assert.match(body, /<sup>/);
  assert.match(body, /FOOTNOTES_TITLE/);
  assert.match(body, /footnoteRefLabel/);
  assert.match(body, /footnoteBackLabel/);
  assert.match(body, /focusFootnote\(/);
  assert.match(body, /data-fn-ref=\{scope\}/);
  assert.match(body, /data-fn-note=\{scope\}/);
  assert.match(body, /tabIndex=\{-1\}/);
  assert.match(src, /scrollIntoView\(\{ block: "nearest", behavior: "auto" \}\)/);
  assert.match(src, /focus\(\{ preventScroll: true \}\)/);
  assert.match(block(".assistant-md .md-footnotes"), /color:\s*var\(--text-muted\)/);
  assert.match(block(".assistant-md button.md-fn-ref"), /vertical-align:\s*super/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(app, /extractFootnotes/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /footnoteScope=\{message\.id\}/);
  assert.match(app, /footnotes=\{/);
  assert.match(body, /FootnoteScopeProvider/);
  assert.match(body, /<FootnotesList/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(
    app,
    /shouldRenderMarkdown\(\{ completed \}\) \? \(\s*<MarkdownBody/,
  );
  assert.doesNotMatch(shortcuts, /Footnote/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/MarkdownFootnote.swift`/);
  assert.match(swift, /Keep in lockstep with `desktop\/src\/markdownFootnote.ts`/);
});

test("OpenAPI stays 0.18.0 and the spec records footnotes", () => {
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.38 /);
  assert.match(spec, /## 138\. v1\.38/);
  assert.match(spec, /GFM footnotes in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_footnote\.py/);
  assert.match(pkg, /markdownFootnote\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.match(swift, /static func extract\(_ text: String, completed: Bool\)/);
  assert.match(swift, /if !completed \{ return Prepared\(text: text, notes: \[\]\) \}/);
  assert.match(swift, /snorlax-fn:\/\//);
  assert.match(swift, /Footnotes/);
  assert.match(markdown, /MarkdownFootnote\.applyMarkers/);
  assert.match(chat, /MarkdownSplit\.bubbles\(in: message\.displayContent, completed: completed\)/);
  assert.match(chat, /MarkdownFootnote\.extract/);
  assert.match(chat, /showFootnotes:/);
  assert.match(chat, /markdownFootnotes/);
  assert.match(markdown, /MarkdownFootnoteList/);
  assert.match(quote, /MarkdownFootnote\.isMarker/);
  assert.match(quote, /WebLinks\.allows\(url\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
});
