// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  TRANSCRIPT_TEXT_ACTION,
  TRANSCRIPT_TEXT_DEFAULT,
  TRANSCRIPT_TEXT_KEYS,
  TRANSCRIPT_TEXT_STEPS,
  TRANSCRIPT_TEXT_STORAGE_KEY,
  applyTranscriptTextStep,
  overlayTextFieldOwnsTranscriptText,
  parseTranscriptTextPercent,
  readTranscriptTextScale,
  transcriptScaleFactor,
  transcriptTextBlocked,
  transcriptTextShouldApply,
  transcriptTextStep,
  writeTranscriptTextScale,
} from "./transcriptTextScale.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "transcriptTextScale.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
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
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);

const PHRASE =
  "v1.24 adjustable transcript text size from the keyboard (Cmd/Ctrl-= and Cmd/Ctrl-+ make the chat transcript text one step larger, Cmd/Ctrl-- one step smaller, and Cmd/Ctrl-0 resets to 100%; the steps are 85%, 92%, 100%, 110%, 120%, and 130%; message bubble text, code blocks, and tool traces use that scale together while padding, images, and the rest of the chrome stay put; the choice persists in local storage; the chord still works from the composer and does not insert text; a key repeat does not step again and does not insert; the ends stay clamped; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; Cmd/Ctrl-1 through Cmd/Ctrl-9 still open a chat and Cmd/Ctrl-0 does not; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-B, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, Cmd/Ctrl-[ / ], Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl = / + / - / 0; iOS hardware command-=, command-+, command--, and command-0, and the control variants, adjust the same steps with Dynamic Type as the base size, the choice persists in UserDefaults, and Gestures & shortcuts lists the chord and has Smaller, Larger, and Default; no new HTTP)";

const openGate = {
  composing: false,
  overlayTextField: false,
  inCard: false,
  findOpen: false,
  switchOpen: false,
  shortcutsOpen: false,
  renaming: false,
  lightboxOpen: false,
  menuOpen: false,
  blocked: false,
};

test("steps clamp between 85% and 130% and 100% is the default", () => {
  assert.deepEqual(TRANSCRIPT_TEXT_STEPS, [85, 92, 100, 110, 120, 130]);
  assert.equal(TRANSCRIPT_TEXT_DEFAULT, 100);
  assert.equal(applyTranscriptTextStep(100, "larger"), 110);
  assert.equal(applyTranscriptTextStep(110, "larger"), 120);
  assert.equal(applyTranscriptTextStep(120, "larger"), 130);
  assert.equal(applyTranscriptTextStep(130, "larger"), 130);
  assert.equal(applyTranscriptTextStep(100, "smaller"), 92);
  assert.equal(applyTranscriptTextStep(92, "smaller"), 85);
  assert.equal(applyTranscriptTextStep(85, "smaller"), 85);
  assert.equal(applyTranscriptTextStep(130, "reset"), 100);
  assert.equal(applyTranscriptTextStep(85, "reset"), 100);
  assert.equal(applyTranscriptTextStep(77, "larger"), 110);
  assert.equal(transcriptScaleFactor(100), 1);
  assert.equal(transcriptScaleFactor(85), 0.85);
  assert.equal(transcriptScaleFactor(130), 1.3);
  assert.equal(transcriptScaleFactor(50), 1);
});

test("storage keeps a known step and drops anything else", () => {
  assert.equal(parseTranscriptTextPercent(null), 100);
  assert.equal(parseTranscriptTextPercent(""), 100);
  assert.equal(parseTranscriptTextPercent("110"), 110);
  assert.equal(parseTranscriptTextPercent(" 85 "), 85);
  assert.equal(parseTranscriptTextPercent("90"), 100);
  assert.equal(parseTranscriptTextPercent("100.5"), 100);
  assert.equal(parseTranscriptTextPercent("nope"), 100);
  const mem = new Map<string, string>();
  const storage = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
  };
  assert.equal(readTranscriptTextScale(storage), 100);
  writeTranscriptTextScale(storage, 120);
  assert.equal(mem.get(TRANSCRIPT_TEXT_STORAGE_KEY), "120");
  assert.equal(readTranscriptTextScale(storage), 120);
  mem.set(TRANSCRIPT_TEXT_STORAGE_KEY, "huge");
  assert.equal(readTranscriptTextScale(storage), 100);
  assert.equal(readTranscriptTextScale(null), 100);
  writeTranscriptTextScale(null, 85);
});

test("Cmd/Ctrl-=, +, -, and 0 are the size chords", () => {
  assert.equal(transcriptTextStep({ key: "=", metaKey: true }), "larger");
  assert.equal(transcriptTextStep({ key: "=", ctrlKey: true }), "larger");
  assert.equal(
    transcriptTextStep({ key: "+", metaKey: true, shiftKey: true }),
    "larger",
  );
  assert.equal(
    transcriptTextStep({ key: "=", code: "Equal", metaKey: true, shiftKey: true }),
    "larger",
  );
  assert.equal(transcriptTextStep({ key: "+", code: "NumpadAdd", ctrlKey: true }), "larger");
  assert.equal(transcriptTextStep({ key: "-", metaKey: true }), "smaller");
  assert.equal(transcriptTextStep({ key: "_", ctrlKey: true, shiftKey: true }), "smaller");
  assert.equal(
    transcriptTextStep({ key: "-", code: "Minus", metaKey: true }),
    "smaller",
  );
  assert.equal(transcriptTextStep({ key: "0", metaKey: true }), "reset");
  assert.equal(transcriptTextStep({ key: "0", code: "Digit0", ctrlKey: true }), "reset");
  assert.equal(transcriptTextStep({ key: "0", code: "Numpad0", metaKey: true }), "reset");
  assert.equal(transcriptTextStep({ key: "=", metaKey: true, repeat: true }), "larger");
  assert.equal(transcriptTextShouldApply({ repeat: true }), false);
  assert.equal(transcriptTextShouldApply({ repeat: false }), true);
  assert.equal(transcriptTextStep({ key: "=" }), null);
  assert.equal(transcriptTextStep({ key: "-", shiftKey: true }), null);
  assert.equal(transcriptTextStep({ key: "0", metaKey: true, shiftKey: true }), null);
  assert.equal(transcriptTextStep({ key: ")", code: "Digit0", metaKey: true, shiftKey: true }), null);
  assert.equal(transcriptTextStep({ key: "1", metaKey: true }), null);
  assert.equal(transcriptTextStep({ key: "9", ctrlKey: true }), null);
  assert.equal(transcriptTextStep({ key: "=", altKey: true, metaKey: true }), null);
  assert.equal(transcriptTextStep({ key: "=", metaKey: true, ctrlKey: true }), null);
  assert.equal(transcriptTextStep({ key: "k", metaKey: true }), null);
  assert.equal(transcriptTextStep({ key: "[", metaKey: true }), null);
});

test("IME, find, the switcher, and modal fields keep the key", () => {
  assert.equal(transcriptTextBlocked(openGate), false);
  assert.equal(transcriptTextBlocked({ ...openGate, composing: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, overlayTextField: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, inCard: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, findOpen: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, switchOpen: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, shortcutsOpen: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, renaming: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, lightboxOpen: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, menuOpen: true }), true);
  assert.equal(transcriptTextBlocked({ ...openGate, blocked: true }), true);
  assert.equal(overlayTextFieldOwnsTranscriptText(true, true), false);
  assert.equal(overlayTextFieldOwnsTranscriptText(true, false), true);
  assert.equal(overlayTextFieldOwnsTranscriptText(false, false), false);
});

test("the transcript scale is wired and listed, with no new HTTP", () => {
  assert.equal(TRANSCRIPT_TEXT_KEYS, "Cmd/Ctrl = / + / - / 0");
  assert.equal(TRANSCRIPT_TEXT_ACTION, "Larger, smaller, or default text");
  const row = CHAT_SHORTCUTS.find((item) => item.id === "transcript-text");
  assert.equal(row?.keys, TRANSCRIPT_TEXT_KEYS);
  assert.equal(row?.action, TRANSCRIPT_TEXT_ACTION);
  assert.match(shortcuts, /v1\.24/);
  assert.match(css, /--transcript-scale: 1/);
  assert.match(css, /\.transcript \.bubble pre/);
  assert.match(css, /\.transcript \.assistant-md code/);
  assert.match(css, /\.transcript \.md-fence-body/);
  assert.match(css, /\.transcript \.tool-trace/);
  assert.match(css, /calc\(14px \* var\(--transcript-scale\)\)/);
  assert.match(css, /calc\(12px \* var\(--transcript-scale\)\)/);
  assert.doesNotMatch(css, /\.transcript[^{]*\{[^}]*zoom\s*:/);
  const handler = app.slice(
    app.indexOf("const onTranscriptText"),
    app.indexOf('addEventListener("keydown", onTranscriptText, true)'),
  );
  assert.match(handler, /transcriptTextStep/);
  assert.match(handler, /transcriptTextBlocked/);
  assert.match(handler, /preventDefault/);
  assert.ok(handler.indexOf("preventDefault") < handler.indexOf("transcriptTextShouldApply"));
  assert.match(handler, /applyTranscriptTextStep/);
  assert.match(handler, /overlayTextFieldOwnsTranscriptText/);
  assert.match(app, /readTranscriptTextScale\(browserTranscriptTextStorage\(\)\)/);
  assert.match(app, /writeTranscriptTextScale\(browserTranscriptTextStorage\(\)/);
  assert.match(app, /data-transcript-scale=\{transcriptTextPercent\}/);
  assert.match(app, /--transcript-scale/);
  assert.match(app, /transcriptScaleFactor\(transcriptTextPercent\)/);
  assert.match(src, /localStorage/);
  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /src\/transcriptTextScale\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.24 /);
  assert.match(spec, /## 124\. v1\.24/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_transcript_text_scale\.py/);
});
