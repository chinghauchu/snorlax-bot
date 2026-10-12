// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DROP_FILES_LABEL,
  dragCarriesFiles,
  escapeClearsFileDrop,
} from "./chatDrop.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "chatDrop.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatDrop.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE =
  "v0.75 drag files onto the chat (dragging files over the open chat shows Drop files to attach; drop adds pending chips like the paperclip; Esc or dragging away clears it; text drags do not; iOS drop on the composer adds the same chips; nothing auto-sends; no new HTTP)";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("file drags light the target; text selections do not", () => {
  assert.equal(DROP_FILES_LABEL, "Drop files to attach");
  assert.equal(dragCarriesFiles(["Files"]), true);
  assert.equal(dragCarriesFiles(["text/uri-list", "Files"]), true);
  assert.equal(dragCarriesFiles(["text/plain"]), false);
  assert.equal(dragCarriesFiles(["text/plain", "text/html"]), false);
  assert.equal(dragCarriesFiles([]), false);
  assert.equal(dragCarriesFiles(null), false);
  assert.equal(dragCarriesFiles(undefined), false);
  assert.equal(escapeClearsFileDrop(true), true);
  assert.equal(escapeClearsFileDrop(false), false);
  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("chat column drop reuses pending chips and does not send", () => {
  const over = sliceFn(app, "function onChatDragOver", "function onChatDragLeave");
  assert.match(over, /dragCarriesFiles/);
  assert.match(over, /event\.preventDefault\(\)/);
  const drop = sliceFn(app, "async function onChatDrop", "async function openAttachedFile");
  assert.match(drop, /dragCarriesFiles/);
  assert.match(drop, /addPendingFile\(file\)/);
  assert.doesNotMatch(drop, /onSend\(/);
  assert.match(app, /escapeClearsFileDrop\(dropTargetRef\.current\)/);
  assert.match(app, /stopImmediatePropagation\(\)/);
  assert.match(app, /onDragOver=\{onChatDragOver\}/);
  assert.match(app, /onDrop=\{\(event\) => void onChatDrop\(event\)\}/);
  assert.match(app, /className="chat-drop-overlay"/);
  assert.match(app, /\{DROP_FILES_LABEL\}/);
  assert.match(css, /\.chat-drop-overlay\s*\{[^}]*color:\s*var\(--text-muted\)/);
  assert.match(css, /\.chat-drop-overlay\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.chat-drop-overlay\s*\{[^}]*pointer-events:\s*none/);
  assert.match(app, /function Paperclip/);
  assert.match(app, /sendMutedWhileGenerating\(busy\)/);
  assert.match(app, /uploadAttachment/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("OpenAPI stays 0.18.0; iOS drops onto the composer; no new HTTP", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /chatDrop\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ci, /test_ios_chat_drop\.py/);
  assert.match(swift, /Drop files to attach/);
  assert.match(swift, /conforms\(to: \.fileURL\)/);
  assert.match(swift, /conforms\(to: \.image\)/);
  assert.match(swift, /conforms\(to: \.movie\)/);
  assert.match(swift, /conforms\(to: \.video\)/);
  assert.match(swift, /conforms\(to: \.pdf\)/);
  assert.doesNotMatch(swift, /\.plainText/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(chat, /\.onDrop\(of: ChatDrop\.types, isTargeted: \$dropTarget\)/);
  assert.match(chat, /ChatDrop\.label/);
  assert.match(chat, /ChatDrop\.accepts\(providers: providers\)/);
  const dropped = sliceFn(chat, ".onDrop(of: ChatDrop.types", ".onDisappear");
  assert.match(dropped, /model\.addPendingFile\(/);
  assert.doesNotMatch(dropped, /model\.send\(/);
  const escape = sliceFn(chat, "onEscapeStop: { composing in", "model.stopGeneratingFromEscape");
  assert.match(escape, /if dropTarget \{/);
  assert.ok(escape.indexOf("if dropTarget {") < escape.indexOf("onEscapeFind"));
});
