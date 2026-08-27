// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ERR_MAX,
  ERR_MAX_VIDEO,
  MAX_ATTACHMENT_BYTES,
  MAX_VIDEO_BYTES,
  attachmentClientError,
  clipboardBitmapName,
  clipboardInsertText,
  composerPasteFromClipboard,
  filesFromClipboard,
  formatAttachmentSize,
  pastedAttachmentName,
  userRightAttachments,
  withPastedName,
} from "./attachments.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("client allows in-limit video; 50MB video and 10MB file/image caps", () => {
  const video = new File([new Uint8Array(12)], "clip.mp4", { type: "video/mp4" });
  assert.equal(attachmentClientError(video), null);
  const byExt = new File([new Uint8Array(12)], "clip.mov", { type: "application/octet-stream" });
  assert.equal(attachmentClientError(byExt), null);
  assert.equal(
    attachmentClientError({
      name: "clip.mp4",
      type: "video/mp4",
      size: MAX_VIDEO_BYTES + 1,
    }),
    ERR_MAX_VIDEO,
  );
  assert.equal(ERR_MAX_VIDEO, "Max 50MB.");
  const huge = new File(
    [new Uint8Array(8)],
    "big.bin",
    { type: "application/octet-stream" },
  );
  Object.defineProperty(huge, "size", { value: MAX_ATTACHMENT_BYTES + 1 });
  assert.equal(
    attachmentClientError({
      name: "big.bin",
      type: "application/octet-stream",
      size: MAX_ATTACHMENT_BYTES + 1,
    }),
    ERR_MAX,
  );
  assert.equal(
    attachmentClientError({
      name: "shot.png",
      type: "image/png",
      size: MAX_ATTACHMENT_BYTES + 1,
    }),
    ERR_MAX,
  );
  const ok = new File([new Uint8Array(8)], "notes.txt", { type: "text/plain" });
  assert.equal(attachmentClientError(ok), null);
});

test("size label and user-right split image vs file vs video", () => {
  assert.equal(formatAttachmentSize(400), "400 B");
  assert.equal(formatAttachmentSize(2048), "2 KB");
  const atts = userRightAttachments({
    attachments: [
      { id: "a", kind: "image", name: "shot.png", url: "/v1/attachments/a", size: 12 },
      { id: "b", kind: "file", name: "doc.pdf", url: "/v1/attachments/b", size: 40 },
      { id: "c", kind: "video", name: "clip.mp4", url: "/v1/attachments/c", size: 80 },
    ],
  });
  assert.equal(atts[0].kind, "image");
  assert.equal(atts[1].kind, "file");
  assert.equal(atts[2].kind, "video");
});

test("left streak reuses user-right attachment chrome: 220x160 image/video, 36px file chip", () => {
  const css = readFileSync(join(here, "styles.css"), "utf8");
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  assert.match(css, /\.bubble-image\s*\{[^}]*max-width:\s*220px/);
  assert.match(css, /\.bubble-image\s*\{[^}]*max-height:\s*160px/);
  assert.match(css, /\.bubble-video\s*\{[^}]*width:\s*220px/);
  assert.match(css, /\.bubble-video\s*\{[^}]*height:\s*160px/);
  assert.match(css, /\.file-chip\s*\{[^}]*height:\s*36px/);
  assert.match(css, /\.file-chip\s*\{[^}]*border-radius:\s*8px/);
  assert.match(css, /\.file-chip\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.message-atts\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.message-atts\s*\{[^}]*align-items:\s*flex-start/);
  assert.match(css, /\.message-atts\s*\{[^}]*gap:\s*6px/);
  assert.match(css, /\.assistant-md\s*\{[^}]*gap:\s*6px/);
  assert.match(css, /\.assistant-md\s*\{[^}]*align-items:\s*flex-start/);
  assert.match(app, /function MessageAttachmentChrome/);
  assert.match(app, /className="assistant-md"/);
  assert.match(app, /className="message-atts"/);
  assert.match(app, /className="bubble-video"/);
  assert.match(app, /function AuthedVideo/);
  assert.match(app, /function PlayMark/);
  assert.match(app, /<PlayMark size=\{24\}/);
  assert.match(app, /controls=\{playing\}/);
  assert.match(css, /\.bubble-video-wrap\s*\{[^}]*width:\s*220px/);
  assert.match(css, /\.bubble-video-wrap\s*\{[^}]*height:\s*160px/);
  assert.match(css, /\.bubble-video-wrap\s*\{[^}]*border-radius:\s*8px/);
  assert.match(css, /\.bubble-video-wrap\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(css, /\.bubble-video-play svg\s*\{[^}]*width:\s*24px/);
  assert.match(css, /\.bubble-video-play svg\s*\{[^}]*height:\s*24px/);
  assert.doesNotMatch(app, /autoPlay|autoplay/);
  const chromeUses = app.split("<MessageAttachmentChrome").length - 1;
  assert.equal(chromeUses, 2);
  assert.match(app, /userRightAttachments/);
  const mdIdx = app.indexOf('className="assistant-md"');
  const chromeIdx = app.indexOf("<MessageAttachmentChrome", mdIdx);
  const markdownIdx = app.indexOf("<MarkdownBody", mdIdx);
  assert.ok(chromeIdx > 0 && markdownIdx > chromeIdx);
  assert.doesNotMatch(app, /handoff-row[\s\S]{0,800}MessageAttachmentChrome/);
  assert.doesNotMatch(app, /handoff-card[\s\S]{0,400}MessageAttachmentChrome/);
  assert.doesNotMatch(app, /className="tool-trace"[\s\S]{0,200}MessageAttachmentChrome/);
  assert.doesNotMatch(app, /<WidgetCard[\s\S]{0,400}MessageAttachmentChrome/);
  assert.doesNotMatch(app, /<ConnectCard[\s\S]{0,400}MessageAttachmentChrome/);
  assert.doesNotMatch(app, /onDrop=\{[^}]*bubble/);
  assert.doesNotMatch(app, /agentPicker|agent-side picker/);
});

test("desktop composer attachments chrome: pending video chip, no danger line for in-limit video, Max 50MB", () => {
  const css = readFileSync(join(here, "styles.css"), "utf8");
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  const att = readFileSync(join(here, "attachments.ts"), "utf8");
  assert.match(css, /\.pending-chips\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.pending-chips\s*\{[^}]*gap:\s*6px/);
  assert.match(css, /\.pending-thumb\s*\{[^}]*width:\s*56px/);
  assert.match(css, /\.pending-thumb\s*\{[^}]*height:\s*56px/);
  assert.match(css, /\.pending-file\s*\{[^}]*height:\s*36px/);
  assert.match(css, /\.pending-file-name\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.pending-file-size\s*\{[^}]*font-size:\s*12px/);
  assert.match(css, /\.file-chip\s*\{[^}]*height:\s*36px/);
  assert.match(css, /\.file-chip\s*\{[^}]*border-radius:\s*8px/);
  assert.match(css, /\.file-chip\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.bubble-image\s*\{[^}]*max-width:\s*220px/);
  assert.match(css, /\.bubble-image\s*\{[^}]*max-height:\s*160px/);
  assert.match(css, /\.bubble-video\s*\{[^}]*width:\s*220px/);
  assert.match(css, /\.bubble-video\s*\{[^}]*height:\s*160px/);
  assert.match(css, /\.composer\.drop-target\s*\{[^}]*outline:\s*1px\s+solid\s+var\(--accent\)/);
  assert.match(css, /\.attach-error\s*\{[^}]*font-size:\s*12px/);
  assert.match(css, /\.attach-error\s*\{[^}]*color:\s*var\(--danger\)/);
  assert.match(app, /uploadAttachment/);
  assert.match(app, /attachmentIds/);
  assert.match(app, /onDrop/);
  assert.match(app, /function Paperclip/);
  assert.match(css, /\.pending-video\s*\{[^}]*background:\s*var\(--bg-elevated\)/);
  assert.match(css, /\.pending-play svg\s*\{[^}]*width:\s*16px/);
  assert.match(css, /\.pending-play svg\s*\{[^}]*height:\s*16px/);
  assert.match(app, /function PendingVideoThumb/);
  assert.match(app, /<PlayMark size=\{16\}/);
  assert.match(app, /row\.kind === "video"/);
  assert.doesNotMatch(att, /Video isn’t supported yet/);
  assert.match(att, /Max 50MB/);
  assert.match(att, /MAX_VIDEO_BYTES/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /\/v1\/chats\//);
  assert.doesNotMatch(app, />Watch</);
  assert.doesNotMatch(app, /watch_video/);
});

test("clipboard bitmap with no filename uses image.png / jpeg jpg / gif / webp", () => {
  assert.equal(clipboardBitmapName("image/png"), "image.png");
  assert.equal(clipboardBitmapName("image/jpeg"), "image.jpg");
  assert.equal(clipboardBitmapName("image/jpg"), "image.jpg");
  assert.equal(clipboardBitmapName("image/gif"), "image.gif");
  assert.equal(clipboardBitmapName("image/webp"), "image.webp");
  assert.equal(pastedAttachmentName({ name: "", type: "image/png" }), "image.png");
  assert.equal(pastedAttachmentName({ name: "", type: "image/jpeg" }), "image.jpg");
  const named = new File([new Uint8Array(4)], "Shot from Finder.png", {
    type: "image/png",
  });
  assert.equal(pastedAttachmentName(named), "Shot from Finder.png");
  const unnamed = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "", {
    type: "image/png",
  });
  assert.equal(withPastedName(unnamed).name, "image.png");
  assert.equal(withPastedName(unnamed).type, "image/png");
});

test("paste image becomes a pending file; text-only paste is not intercepted", () => {
  const png = new File([new Uint8Array([1, 2, 3])], "", { type: "image/png" });
  const imagePaste = composerPasteFromClipboard({
    items: [
      { kind: "file", type: "image/png", getAsFile: () => png },
    ],
    getData: () => "",
  });
  assert.equal(imagePaste.intercept, true);
  assert.equal(imagePaste.files.length, 1);
  assert.equal(imagePaste.files[0].name, "image.png");
  assert.equal(imagePaste.text, "");

  const textPaste = composerPasteFromClipboard({
    items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    getData: (type) => (type === "text/plain" ? "hello" : ""),
  });
  assert.equal(textPaste.intercept, false);
  assert.equal(textPaste.files.length, 0);
  assert.equal(filesFromClipboard({ items: [] }).length, 0);
});

test("mixed clipboard queues files and keeps text; Finder file:// is not inserted", () => {
  const img = new File([new Uint8Array([9])], "photo.png", { type: "image/png" });
  const mixed = composerPasteFromClipboard({
    items: [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => img },
    ],
    getData: (type) => (type === "text/plain" ? "see this" : ""),
  });
  assert.equal(mixed.intercept, true);
  assert.equal(mixed.files[0].name, "photo.png");
  assert.equal(mixed.text, "see this");
  const finder = new File([new Uint8Array([8])], "notes.pdf", {
    type: "application/pdf",
  });
  assert.equal(clipboardInsertText("file:///Users/me/notes.pdf", [finder]), "");
  assert.equal(clipboardInsertText("notes.pdf", [finder]), "");
  const txt = new File([new Uint8Array([1])], "hello.txt", { type: "text/plain" });
  const asFile = composerPasteFromClipboard({
    items: [{ kind: "file", type: "text/plain", getAsFile: () => txt }],
    getData: () => "",
  });
  assert.equal(asFile.intercept, true);
  assert.equal(asFile.files[0].name, "hello.txt");
});

test("paste oversize still Max 10MB. / Max 50MB.; in-limit video is allowed", () => {
  const hugeImg = composerPasteFromClipboard({
    items: [
      {
        kind: "file",
        type: "image/png",
        getAsFile: () =>
          new File([new Uint8Array(8)], "shot.png", { type: "image/png" }),
      },
    ],
  });
  assert.equal(
    attachmentClientError({
      name: hugeImg.files[0].name,
      type: "image/png",
      size: MAX_ATTACHMENT_BYTES + 1,
    }),
    ERR_MAX,
  );
  assert.equal(
    attachmentClientError({
      name: "clip.mp4",
      type: "video/mp4",
      size: MAX_VIDEO_BYTES + 1,
    }),
    ERR_MAX_VIDEO,
  );
  const video = new File([new Uint8Array(12)], "clip.mp4", { type: "video/mp4" });
  const pasted = composerPasteFromClipboard({
    items: [{ kind: "file", type: "video/mp4", getAsFile: () => video }],
  });
  assert.equal(pasted.intercept, true);
  assert.equal(attachmentClientError(pasted.files[0]), null);
});

test("composer paste event fills the same pending chips; paperclip and drop stay", () => {
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  assert.match(app, /onPaste=\{/);
  assert.match(app, /composerPasteFromClipboard/);
  assert.match(app, /onComposerPaste/);
  assert.match(app, /isComposerPasteChord/);
  assert.match(app, /addPendingFile/);
  assert.match(app, /onDrop/);
  assert.match(app, /function Paperclip/);
  assert.match(app, /if \(!result\.intercept\) return/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /\/v1\/chats\//);
});
