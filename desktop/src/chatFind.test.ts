// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FIND_CLOSE_LABEL,
  FIND_EMPTY_LABEL,
  FIND_INPUT_LABEL,
  FIND_NEXT_LABEL,
  FIND_PREV_LABEL,
  escapeClosesFind,
  findCountLabel,
  findHits,
  findQueryActive,
  highlightSpans,
  isFindChord,
  omitsUnmatchedMessage,
  stepFindIndex,
  transcriptFindRows,
} from "./chatFind.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatFind.ts"), "utf8");
const findText = readFileSync(join(here, "FindText.tsx"), "utf8");
const markdown = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatFind.swift"),
  "utf8",
);

const PHRASE =
  "v0.71 in-chat find (Cmd/Ctrl-F in an open chat shows a find bar over the loaded transcript; matches highlight; Enter/Shift-Enter and up/down jump between them; n of m; Esc closes and clears highlights; iOS search filters and highlights those loaded messages; no new HTTP)";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("Cmd/Ctrl-F is the find chord; Shift and Alt are not", () => {
  assert.equal(isFindChord({ key: "f", metaKey: true }), true);
  assert.equal(isFindChord({ key: "F", ctrlKey: true }), true);
  assert.equal(isFindChord({ key: "f", metaKey: true, shiftKey: true }), false);
  assert.equal(isFindChord({ key: "f", ctrlKey: true, altKey: true }), false);
  assert.equal(isFindChord({ key: "f", metaKey: true, ctrlKey: true }), false);
  assert.equal(isFindChord({ key: "g", metaKey: true }), false);
  assert.equal(isFindChord({ key: "f" }), false);
});

test("matches are case-insensitive and wrap with n of m", () => {
  assert.equal(findQueryActive("  "), false);
  assert.equal(findQueryActive("a"), true);
  const hits = findHits(
    [
      { id: "m1", text: "Say Hello" },
      { id: "m2", text: "hello again, hello." },
    ],
    "HELLO",
  );
  assert.deepEqual(
    hits.map((hit) => [hit.rowId, hit.start, hit.end]),
    [
      ["m1", 4, 9],
      ["m2", 0, 5],
      ["m2", 13, 18],
    ],
  );
  assert.equal(findCountLabel(0, hits.length), "1 of 3");
  assert.equal(findCountLabel(2, hits.length), "3 of 3");
  assert.equal(findCountLabel(-1, 0), "0 of 0");
  assert.equal(stepFindIndex(2, 3, 1), 0);
  assert.equal(stepFindIndex(0, 3, -1), 2);
  assert.equal(stepFindIndex(0, 0, 1), -1);

  const dotted = findHits([{ id: "m", text: "a.b a.b" }], "a.b");
  assert.equal(dotted.length, 2);
  assert.equal(dotted[0]?.start, 0);
  assert.equal(dotted[1]?.start, 4);

  const spans = highlightSpans("ab ab", "ab", { start: 3, end: 5 });
  assert.deepEqual(
    spans.map((span) => [span.text, span.match, span.active]),
    [
      ["ab", true, false],
      [" ", false, false],
      ["ab", true, true],
    ],
  );
});

test("collapsed tools and cards are not searchable; iOS can filter", () => {
  const rows = transcriptFindRows([
    { id: "user", texts: ["Hello"], single: true },
    { id: "tool", texts: ["Ran ls"], hidden: true, single: true },
    { id: "card", texts: ["Approve?"], skip: true, single: true },
    { id: "agent", texts: ["Hello there", ""] },
    { id: "empty", texts: [""], single: true },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["user", "agent:0"],
  );
  assert.equal(
    omitsUnmatchedMessage({
      searchable: true,
      texts: ["nope"],
      query: "hello",
    }),
    true,
  );
  assert.equal(
    omitsUnmatchedMessage({
      searchable: true,
      texts: ["Hello"],
      query: "hello",
    }),
    false,
  );
  assert.equal(
    omitsUnmatchedMessage({
      searchable: false,
      texts: ["nope"],
      query: "hello",
    }),
    false,
  );
  assert.equal(
    omitsUnmatchedMessage({
      searchable: true,
      texts: ["Hello"],
      query: " ",
    }),
    false,
  );
});

test("Esc closes find before Stop, Jump, or recall", () => {
  assert.equal(escapeClosesFind({ open: true }), true);
  assert.equal(escapeClosesFind({ open: true, composing: true }), false);
  assert.equal(escapeClosesFind({ open: false }), false);

  const escStart = app.indexOf('if (event.key !== "Escape") return;');
  assert.ok(escStart >= 0);
  const escBlock = app.slice(escStart, app.indexOf("async function onSend()", escStart));
  const closeAt = escBlock.indexOf("escapeClosesFind(");
  const stopAt = escBlock.indexOf("escapeStopsGenerating(");
  const recallAt = escBlock.indexOf("escapeClearsRecall(");
  const jumpAt = escBlock.indexOf("escapeJumpsToLatest(");
  assert.ok(closeAt >= 0 && stopAt > closeAt && recallAt > closeAt && jumpAt > closeAt);
  const closeSlice = escBlock.slice(closeAt, stopAt);
  assert.match(closeSlice, /closeFind\(\)/);
  assert.match(closeSlice, /preventDefault/);
  assert.doesNotMatch(closeSlice, /onStopGenerating/);
});

test("desktop find bar highlights loaded text and does not filter", () => {
  assert.match(app, /from "\.\/chatFind"/);
  assert.match(app, /isFindChord/);
  assert.match(app, /transcriptFindRows/);
  assert.match(app, /findCountLabel/);
  assert.match(app, /stepFindIndex/);
  assert.match(app, /FindQueryProvider/);
  assert.match(app, /className="find-bar"/);
  assert.match(app, /role="search"/);
  assert.match(app, /FIND_INPUT_LABEL/);
  assert.match(app, /FIND_PREV_LABEL/);
  assert.match(app, /FIND_NEXT_LABEL/);
  assert.match(app, /FIND_CLOSE_LABEL/);
  assert.equal(FIND_INPUT_LABEL, "Find in chat");
  assert.equal(FIND_PREV_LABEL, "Previous match");
  assert.equal(FIND_NEXT_LABEL, "Next match");
  assert.equal(FIND_CLOSE_LABEL, "Close find");
  assert.equal(FIND_EMPTY_LABEL, "No matches");
  assert.match(app, /data-find-row/);
  assert.match(app, /FindText/);
  assert.match(findText, /find-hit/);
  assert.match(findText, /data-find-active/);
  assert.doesNotMatch(app, /omitsUnmatchedMessage/);

  const chord = sliceFn(app, "if (!isFindChord(event)) return;", "window.addEventListener");
  assert.match(chord, /preventDefault/);
  assert.match(chord, /setFindOpen\(true\)/);

  const enter = sliceFn(app, 'if (event.key !== "Enter") return;', "window.addEventListener");
  assert.match(enter, /stepFindIndex/);
  assert.match(enter, /event\.shiftKey \? -1 : 1/);
  assert.match(enter, /HTMLTextAreaElement/);

  assert.match(markdown, /FindText/);
  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("OpenAPI stays 0.18.0; iOS shares the labels; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /chatFind\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(swift.includes(FIND_INPUT_LABEL));
  assert.ok(swift.includes(FIND_PREV_LABEL));
  assert.ok(swift.includes(FIND_NEXT_LABEL));
  assert.ok(swift.includes(FIND_CLOSE_LABEL));
  assert.ok(swift.includes(FIND_EMPTY_LABEL));
  assert.match(swift, /0 of 0/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
});
