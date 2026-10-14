// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  backspaceRemovesLastChip,
  composerAllowsChipBackspace,
  withoutLastChip,
} from "./backspaceChip.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "backspaceChip.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "BackspaceChip.swift"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
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
  "v0.87 Backspace removes the last attachment chip (when the composer text is empty, desktop Backspace or iOS hardware Delete removes the rightmost pending chip, one per keypress; with text, Backspace edits the text; no chips does nothing; the chip X stays; nothing auto-sends; the on-screen Delete key matches; no new HTTP)";

const plain = {
  key: "Backspace",
  composerText: "",
  chipCount: 2,
  composing: false,
};

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("plain Backspace on an empty composer removes one last chip", () => {
  assert.equal(backspaceRemovesLastChip(plain), true);
  assert.equal(backspaceRemovesLastChip({ ...plain, chipCount: 1 }), true);
  assert.equal(backspaceRemovesLastChip({ ...plain, chipCount: 0 }), false);
  assert.deepEqual([...withoutLastChip(["a", "b", "c"])], ["a", "b"]);
  assert.deepEqual([...withoutLastChip(["only"])], []);
  assert.deepEqual([...withoutLastChip([])], []);
  let chips = ["a", "b", "c"];
  chips = [...withoutLastChip(chips)];
  assert.deepEqual(chips, ["a", "b"]);
  chips = [...withoutLastChip(chips)];
  assert.deepEqual(chips, ["a"]);
  assert.notDeepEqual(chips, []);
});

test("text, spaces, IME, chords, and other keys stay with the field", () => {
  assert.equal(backspaceRemovesLastChip({ ...plain, composerText: "a" }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, composerText: " " }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, composerText: "\n" }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, composing: true }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, key: "Delete" }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, key: "Enter" }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, shiftKey: true }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, metaKey: true }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, ctrlKey: true }), false);
  assert.equal(backspaceRemovesLastChip({ ...plain, altKey: true }), false);
  assert.equal(
    composerAllowsChipBackspace({ composerText: "", composing: false, chord: false }),
    true,
  );
  assert.equal(
    composerAllowsChipBackspace({ composerText: "x", composing: false, chord: false }),
    false,
  );
  assert.equal(
    composerAllowsChipBackspace({ composerText: "", composing: true, chord: false }),
    false,
  );
  assert.equal(
    composerAllowsChipBackspace({ composerText: "", composing: false, chord: true }),
    false,
  );
});

test("desktop wires Backspace on the composer and leaves the chip X", () => {
  const keys = sliceFn(app, "function onComposerKey", "function insertDraftAtCaret");
  const composingAt = keys.indexOf("isComposerComposing(event)");
  const backspaceAt = keys.indexOf("backspaceRemovesLastChip");
  const mutedAt = keys.indexOf("sendMutedWhileGenerating");
  const sendAt = keys.indexOf("void onSend()");
  assert.ok(composingAt >= 0 && composingAt < backspaceAt);
  assert.ok(backspaceAt >= 0 && backspaceAt < mutedAt);
  assert.ok(sendAt > mutedAt);
  const branch = sliceFn(keys, "backspaceRemovesLastChip", "sendMutedWhileGenerating");
  assert.match(branch, /composerText: event\.currentTarget\.value/);
  assert.match(branch, /chipCount: pendingAttachments\.length/);
  assert.match(branch, /event\.preventDefault\(\)/);
  assert.match(branch, /removeLastPendingChip\(\)/);
  assert.doesNotMatch(branch, /onSend\(/);
  assert.doesNotMatch(branch, /setDraft\(/);
  assert.doesNotMatch(branch, /chatDrafts/);
  assert.doesNotMatch(branch, /pendingAttachments\s*=\s*\[\]/);
  const remove = sliceFn(app, "function removeLastPendingChip", "async function onPickAvatar");
  assert.match(remove, /withoutLastChip\(prev\)/);
  assert.match(remove, /composerRef\.current\?\.focus\(\)/);
  assert.match(remove, /URL\.revokeObjectURL/);
  assert.doesNotMatch(remove, /onSend\(/);
  assert.match(app, /onClick=\{\(\) => removePending\(row\.id\)\}/);
  assert.match(app, /aria-label=\{`Remove \$\{row\.name\}`\}/);
  assert.match(app, /from "\.\/backspaceChip"/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(app, /computerPane\.ts/);
});

test("iOS Delete on an empty composer removes the last chip", () => {
  assert.match(swift, /static func composerAllowsRemove/);
  assert.match(swift, /static func removesLast/);
  assert.match(swift, /static func withoutLast/);
  assert.match(swift, /composerText\.isEmpty/);
  assert.match(swift, /chipCount > 0/);
  assert.doesNotMatch(swift, /\/v1\//);
  const del = sliceFn(composer, "override func deleteBackward()", "override func pressesEnded");
  assert.match(del, /BackspaceChip\.composerAllowsRemove/);
  assert.match(del, /markedTextRange != nil/);
  assert.match(del, /onBackspaceRemoveChip\?\(\) == true/);
  assert.match(del, /super\.deleteBackward\(\)/);
  assert.doesNotMatch(del, /resignFirstResponder/);
  assert.match(composer, /keyboardDeleteOrBackspace/);
  assert.match(composer, /mods\.contains\(\.command\)/);
  assert.match(composer, /mods\.contains\(\.shift\)/);
  assert.match(composer, /var onBackspaceRemoveChip: \(\(\) -> Bool\)\?/);
  assert.match(chat, /onBackspaceRemoveChip:/);
  assert.match(chat, /model\.removeLastPendingChipFromBackspace\(\)/);
  assert.match(chat, /model\.removePending\(id: row\.id\)/);
  assert.match(chat, /accessibilityLabel\("Remove \\\(row\.name\)"\)/);
  const callback = sliceFn(chat, "onBackspaceRemoveChip:", "sendMuted:");
  assert.doesNotMatch(callback, /model\.send\(/);
  assert.match(model, /func removeLastPendingChipFromBackspace/);
  assert.match(model, /BackspaceChip\.removesLast/);
  assert.match(model, /BackspaceChip\.withoutLast/);
  assert.match(model, /removePending\(id: last\.id\)/);
  assert.match(model, /wantsComposerFocus = true/);
  assert.doesNotMatch(
    sliceFn(model, "func removeLastPendingChipFromBackspace", "func openAttachment"),
    /send\(\)/,
  );
});

test("OpenAPI stays 0.18.0; v0.87 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v0.87 "));
  assert.ok(roadmap.includes("Backspace removes the last attachment chip"));
  assert.match(pkg, /backspaceChip\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_backspace_chip\.py/);
});
