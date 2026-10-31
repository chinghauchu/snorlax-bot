// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { transcriptPlainText } from "./copyTranscript.ts";
import {
  TRANSCRIPT_FILENAME,
  TRANSCRIPT_MIME,
  TRANSCRIPT_SAVE_ARIA,
  TRANSCRIPT_SAVE_LABEL,
  TRANSCRIPT_SAVE_MS,
  TRANSCRIPT_SAVED_ARIA,
  TRANSCRIPT_SAVED_LABEL,
  showTranscriptSave,
  transcriptSaveAnimates,
  transcriptSaveAriaLabel,
  transcriptSaveBody,
  transcriptSaveKeepsChat,
  transcriptSaveLabel,
} from "./transcriptSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "transcriptSave.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
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
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "TranscriptSave.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.32 save the open chat transcript";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("labels, timing, and no animation", () => {
  assert.equal(TRANSCRIPT_SAVE_LABEL, "Save");
  assert.equal(TRANSCRIPT_SAVED_LABEL, "Saved");
  assert.equal(TRANSCRIPT_SAVE_ARIA, "Save transcript");
  assert.equal(TRANSCRIPT_SAVED_ARIA, "Saved");
  assert.equal(TRANSCRIPT_SAVE_MS, 1500);
  assert.equal(TRANSCRIPT_FILENAME, "transcript.txt");
  assert.equal(TRANSCRIPT_MIME, "text/plain;charset=utf-8");
  assert.equal(transcriptSaveLabel(false), "Save");
  assert.equal(transcriptSaveLabel(true), "Saved");
  assert.equal(transcriptSaveAriaLabel(false), "Save transcript");
  assert.equal(transcriptSaveAriaLabel(true), "Saved");
  assert.equal(showTranscriptSave({ chatOpen: true, text: "hello" }), true);
  assert.equal(showTranscriptSave({ chatOpen: false, text: "hello" }), false);
  assert.equal(showTranscriptSave({ chatOpen: true, text: null }), false);
  assert.equal(showTranscriptSave({ chatOpen: true, text: "" }), false);
  assert.equal(transcriptSaveKeepsChat(), true);
  assert.equal(transcriptSaveAnimates(false), false);
  assert.equal(transcriptSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save transcript"/);
  assert.match(swift, /static let filename = "transcript.txt"/);
  assert.match(swift, /guard chatOpen, let text, !text.isEmpty else \{ return false \}/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-transcript/);
  assert.match(src, /Never animate/);
});

test("the file is the copied transcript and not a rewritten reply", () => {
  const rows = [
    { kind: "message", content: "  hello  " },
    { kind: "tool", content: "Ran ls" },
    { kind: "widget", content: "Pick one" },
    { kind: "approve", content: "rm" },
    { kind: "connect", content: "Slack" },
    { kind: "handoff", content: "ask" },
    { kind: "message", content: "keep\n\nthis" },
    { kind: "message", content: "   " },
  ];
  const copied = transcriptPlainText(rows);
  assert.equal(copied, "hello\n\nkeep\n\nthis");
  assert.equal(transcriptSaveBody(copied!), copied);
  assert.equal(transcriptSaveBody(copied!).endsWith("\n"), false);
  assert.equal(transcriptSaveBody(copied!).includes("Ran ls"), false);
  assert.equal(transcriptSaveBody(copied!).includes("User:"), false);
  assert.equal(transcriptSaveBody("  x\ny  "), "  x\ny  ");
  assert.equal(transcriptSaveBody(""), "");
  assert.equal(transcriptSaveBody("a\n"), "a\n");
  assert.equal(showTranscriptSave({ chatOpen: true, text: copied }), true);
  assert.equal(
    showTranscriptSave({ chatOpen: true, text: transcriptPlainText([]) }),
    false,
  );
});

test("Save sits in the chat header and does not replace the copy chord", () => {
  const head = sliceFn(app, '<header className="chat-head">', "</header>");
  assert.match(head, /showTranscriptSave\(\{/);
  assert.match(head, /transcriptPlainText\(visibleMessages\)/);
  assert.match(head, /transcriptSaveLabel\(transcriptSaved\)/);
  assert.match(head, /aria-label=\{transcriptSaveAriaLabel\(transcriptSaved\)\}/);
  assert.match(head, /className="message-action transcript-save"/);
  assert.match(head, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(head, /onClick=\{onSaveTranscript\}/);
  const who = head.indexOf('className="chat-who"');
  const saveAt = head.indexOf("transcript-save");
  assert.ok(who >= 0 && who < saveAt);
  const copyCall = sliceFn(app, "copyTranscriptRef.current = () => {", "function onSaveTranscript");
  assert.match(copyCall, /transcriptPlainText\(visibleMessages\)/);
  assert.match(copyCall, /copyText\(text\)/);
  assert.match(copyCall, /setTranscriptCopiedId/);
  assert.doesNotMatch(copyCall, /downloadTranscript/);
  assert.doesNotMatch(copyCall, /transcriptSaveBody/);
  assert.doesNotMatch(copyCall, /TRANSCRIPT_FILENAME/);
  const saveCall = sliceFn(app, "function onSaveTranscript", "// v1.14:");
  assert.match(saveCall, /transcriptSaveKeepsChat\(\)/);
  assert.match(saveCall, /transcriptPlainText\(visibleMessages\)/);
  assert.match(saveCall, /transcriptSaveBody\(text\)/);
  assert.match(saveCall, /downloadTranscript\(/);
  assert.match(saveCall, /TRANSCRIPT_FILENAME/);
  assert.match(saveCall, /TRANSCRIPT_SAVE_MS/);
  assert.match(saveCall, /setTranscriptSaved\(true\)/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /setTranscriptCopiedId/);
  assert.doesNotMatch(saveCall, /reply\.md/);
  assert.doesNotMatch(saveCall, /message\.txt/);
  const save = block(".transcript-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".transcript-save:focus-visible"), /outline:/);
  const reduceAt = css.indexOf(".transcript-save {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for transcript Save");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 80,
  );
  assert.match(reduce, /\.transcript-save/);
  assert.doesNotMatch(shortcuts, /Save transcript/);
  assert.doesNotMatch(iosShortcuts, /Save transcript/);
});

test("iOS Save writes the loaded transcript and the other saves stay", () => {
  const bar = sliceFn(chat, ".toolbar {", ".sheet(isPresented: $model.showProfile)");
  assert.match(bar, /if offersTranscriptSave/);
  assert.match(bar, /TranscriptSave\.label\(saved: transcriptSaved\)/);
  assert.match(bar, /TranscriptSave\.accessibilityLabel\(saved: transcriptSaved\)/);
  assert.match(bar, /TranscriptSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(bar, /saveOpenTranscript\(\)/);
  assert.match(bar, /\.font\(\.system\(size: 12, weight: \.medium\)\)/);
  const saveCall = sliceFn(chat, "private func saveOpenTranscript", "private func chatNavKey");
  assert.match(saveCall, /TranscriptSave\.keepsChat\(\)/);
  assert.match(saveCall, /CopyTranscript\.plainText\(messages: visible\)/);
  assert.match(saveCall, /TranscriptSave\.bodyText\(text\)/);
  assert.match(saveCall, /TranscriptSave\.writeFile/);
  assert.match(saveCall, /TranscriptSave\.filename/);
  assert.match(saveCall, /TranscriptSave\.feedbackNanoseconds/);
  assert.match(saveCall, /transcriptShareURL = file/);
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.doesNotMatch(saveCall, /PHPhotoLibrary/);
  assert.doesNotMatch(saveCall, /composerFocused/);
  assert.match(chat, /UIActivityViewController/);
  const offer = sliceFn(chat, "private var offersTranscriptSave", "var body: some View");
  assert.match(offer, /TranscriptSave\.showsSave\(/);
  assert.match(offer, /CopyTranscript\.plainText\(messages:/);
  assert.match(offer, /hasRealAgent/);
  const copyCall = sliceFn(chat, "private func copyOpenTranscript", "private func noteLinkCopied");
  assert.match(copyCall, /UIPasteboard\.general\.string = text/);
  assert.doesNotMatch(copyCall, /TranscriptSave/);
  assert.doesNotMatch(copyCall, /transcript\.txt/);
  const reply = sliceFn(chat, "private func saveReply", "private func copyMessageText");
  assert.doesNotMatch(reply, /TranscriptSave/);
  assert.doesNotMatch(reply, /transcript\.txt/);
  const userSave = sliceFn(chat, "private func saveUserMessage", "private struct BubbleTimestampMenu");
  assert.doesNotMatch(userSave, /TranscriptSave/);
  assert.doesNotMatch(userSave, /transcript\.txt/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 232\. v2\.32/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_transcript_save\.py/);
  assert.match(pkg, /transcriptSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
