// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ERR_MAX,
  ERR_VIDEO,
  MAX_ATTACHMENT_BYTES,
  attachmentClientError,
  formatAttachmentSize,
  userRightAttachments,
} from "./attachments.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("client rejects video and oversize before upload", () => {
  const video = new File([new Uint8Array(12)], "clip.mp4", { type: "video/mp4" });
  assert.equal(attachmentClientError(video), ERR_VIDEO);
  const huge = new File(
    [new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
    "big.bin",
    { type: "application/octet-stream" },
  );
  assert.equal(attachmentClientError(huge), ERR_MAX);
  const ok = new File([new Uint8Array(8)], "notes.txt", { type: "text/plain" });
  assert.equal(attachmentClientError(ok), null);
});

test("size label and user-right split image vs file", () => {
  assert.equal(formatAttachmentSize(400), "400 B");
  assert.equal(formatAttachmentSize(2048), "2 KB");
  const atts = userRightAttachments({
    attachments: [
      { id: "a", kind: "image", name: "shot.png", url: "/v1/attachments/a", size: 12 },
      { id: "b", kind: "file", name: "doc.pdf", url: "/v1/attachments/b", size: 40 },
    ],
  });
  assert.equal(atts[0].kind, "image");
  assert.equal(atts[1].kind, "file");
});

test("desktop composer attachments chrome: 56px thumb, 36px file chip, wrap 6px", () => {
  const css = readFileSync(join(here, "styles.css"), "utf8");
  const app = readFileSync(join(here, "App.tsx"), "utf8");
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
  assert.match(css, /\.composer\.drop-target\s*\{[^}]*outline:\s*1px\s+solid\s+var\(--accent\)/);
  assert.match(css, /\.attach-error\s*\{[^}]*font-size:\s*12px/);
  assert.match(css, /\.attach-error\s*\{[^}]*color:\s*var\(--danger\)/);
  assert.match(app, /uploadAttachment/);
  assert.match(app, /attachmentIds/);
  assert.match(app, /onDrop/);
  assert.match(app, /function Paperclip/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /\/v1\/chats\//);
});
