// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  PENDING_IMAGE_PREVIEW_ACTION,
  pendingImageOpensPreview,
  pendingImagePreviewAria,
  pendingImagePreviewKeepsChip,
  pendingImagePreviewTarget,
} from "./pendingImagePreview.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "pendingImagePreview.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "PendingImagePreview.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE = "v2.10 preview a pending image before sending";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("only a pending image with a preview URL opens the lightbox", () => {
  assert.equal(PENDING_IMAGE_PREVIEW_ACTION, "Preview");
  assert.equal(pendingImageOpensPreview("image"), true);
  assert.equal(pendingImageOpensPreview("video"), false);
  assert.equal(pendingImageOpensPreview("file"), false);
  assert.equal(pendingImagePreviewAria("shot.png"), "Preview shot.png");
  assert.equal(pendingImagePreviewAria("  "), "Preview image");
  assert.equal(pendingImagePreviewKeepsChip(), true);

  assert.deepEqual(
    pendingImagePreviewTarget({
      id: "att-1",
      kind: "image",
      name: "shot.png",
      previewUrl: "blob:preview",
    }),
    { id: "att-1", url: "blob:preview", name: "shot.png" },
  );
  assert.equal(
    pendingImagePreviewTarget({
      id: "att-2",
      kind: "image",
      name: "   ",
      previewUrl: "blob:preview",
    })?.name,
    "Image",
  );
  assert.equal(
    pendingImagePreviewTarget({
      id: "att-3",
      kind: "image",
      name: "shot.png",
      previewUrl: "  ",
    }),
    null,
  );
  assert.equal(
    pendingImagePreviewTarget({
      id: "att-4",
      kind: "video",
      name: "clip.mp4",
      previewUrl: "blob:video",
    }),
    null,
  );
  assert.equal(
    pendingImagePreviewTarget({
      id: "att-5",
      kind: "file",
      name: "notes.txt",
    }),
    null,
  );
  assert.equal(
    pendingImagePreviewTarget({
      id: "",
      kind: "image",
      name: "shot.png",
      previewUrl: "blob:preview",
    }),
    null,
  );
});

test("desktop pending image chip opens the existing lightbox and the × still only removes", () => {
  assert.match(app, /from "\.\/pendingImagePreview"/);
  assert.match(app, /pendingImagePreviewTarget\(row\)/);
  assert.match(app, /pendingImagePreviewAria\(row\.name\)/);
  assert.match(app, /className="pending-preview"/);
  assert.match(app, /openImageLightbox\(target, event\.currentTarget\)/);
  assert.match(css, /\.pending-thumb \.pending-preview\s*\{[^}]*cursor:\s*zoom-in/);
  assert.match(css, /\.pending-thumb \.pending-preview:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);

  const chips = sliceFn(app, 'className="pending-chips"', "{attachError");
  const image = sliceFn(chips, 'row.kind === "image"', 'row.kind === "video"');
  assert.match(image, /className="pending-preview"/);
  assert.match(image, /type="button"/);
  assert.match(image, /pendingImagePreviewTarget\(row\)/);
  assert.match(image, /if \(!target\) return/);
  assert.match(image, /openImageLightbox\(target, event\.currentTarget\)/);
  assert.match(image, /aria-label=\{pendingImagePreviewAria\(row\.name\)\}/);
  assert.match(image, /onClick=\{\(\) => removePending\(row\.id\)\}/);
  assert.match(image, /aria-label=\{`Remove \$\{row\.name\}`\}/);
  assert.doesNotMatch(image, /onSend\(/);
  assert.doesNotMatch(image, /setDraft\(/);

  const video = sliceFn(chips, "<PendingVideoThumb", 'className="pending-file"');
  assert.doesNotMatch(video, /pending-preview|pendingImagePreview|openImageLightbox/);
  assert.match(video, /onRemove=\{\(\) => removePending\(row\.id\)\}/);
  const files = chips.slice(chips.indexOf('className="pending-file"'));
  assert.match(files, /onClick=\{\(\) => removePending\(row\.id\)\}/);
  assert.doesNotMatch(files, /pending-preview|pendingImagePreview|openImageLightbox/);
});

test("iOS pending image chip uses the same lightbox and leaves the chip", () => {
  assert.match(swift, /kind == \.image/);
  assert.match(swift, /static func accessibilityLabel\(name: String\)/);
  assert.match(swift, /return "Preview image"/);
  assert.match(swift, /return "Preview \\\(trimmed\)"/);
  assert.match(swift, /static func previewData/);
  assert.match(swift, /!data\.isEmpty/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  const chip = sliceFn(chat, "private func pendingChip", "private struct FlowWrap");
  const image = sliceFn(chip, "row.kind == .image", "row.kind == .video");
  assert.match(image, /PendingImagePreview\.previewData/);
  assert.match(image, /onPreviewPendingImage\(/);
  assert.match(image, /local: bytes/);
  assert.match(chat, /onPreviewPendingImage: \{ openLightbox\(\$0\) \}/);
  assert.match(image, /PendingImagePreview\.accessibilityLabel\(name: row\.name\)/);
  assert.match(image, /model\.removePending\(id: row\.id\)/);
  assert.match(image, /accessibilityLabel\("Remove \\\(row\.name\)"\)/);
  assert.doesNotMatch(image, /model\.send\(/);
  const video = sliceFn(chip, "row.kind == .video", "ChatAttachment.formatSize");
  assert.doesNotMatch(video, /PendingImagePreview|openLightbox/);
  assert.match(video, /model\.removePending\(id: row\.id\)/);
});

test("OpenAPI stays 0.18.0; v2.10 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /pendingImagePreview\.test\.ts/);
  assert.match(ci, /test_ios_pending_image_preview\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v2\.10 /);
  assert.match(spec, /## 210\. v2\.10/);
  assert.match(spec, /Checked v0\.79 on main at 8cb29dd/);
});
