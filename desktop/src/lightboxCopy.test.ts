// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LIGHTBOX_COPY_ARIA,
  LIGHTBOX_COPY_COPIED_ARIA,
  LIGHTBOX_COPY_COPIED_LABEL,
  LIGHTBOX_COPY_LABEL,
  LIGHTBOX_COPY_MS,
  lightboxCopyAria,
  lightboxCopyAnimates,
  lightboxCopyBlob,
  lightboxCopyKeepsOpen,
  lightboxCopyLabel,
  lightboxCopyMimeType,
  lightboxCopyOffered,
} from "./lightboxCopy.ts";
import { lightboxZoomFocusOrder } from "./lightboxZoom.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "lightboxCopy.ts"), "utf8");
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
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "LightboxCopy.swift"),
  "utf8",
);
const overlay = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ImageLightbox.swift"),
  "utf8",
);

const PHRASE = "v2.18 copy the image from the lightbox";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test(PHRASE, () => {
  assert.match(src, /v2\.18/);
  assert.match(swift, /v2\.18/);
  assert.equal(LIGHTBOX_COPY_LABEL, "Copy");
  assert.equal(LIGHTBOX_COPY_COPIED_LABEL, "Copied");
  assert.equal(LIGHTBOX_COPY_ARIA, "Copy image");
  assert.equal(LIGHTBOX_COPY_COPIED_ARIA, "Copied");
  assert.equal(LIGHTBOX_COPY_MS, 1200);
  assert.equal(lightboxCopyKeepsOpen(), true);
  assert.equal(lightboxCopyAnimates(false), false);
  assert.equal(lightboxCopyAnimates(true), false);
  assert.equal(lightboxCopyLabel(false), "Copy");
  assert.equal(lightboxCopyLabel(true), "Copied");
  assert.equal(lightboxCopyAria(false), "Copy image");
  assert.equal(lightboxCopyAria(true), "Copied");
});

test("Copy is offered with Save, and only a clipboard image type is copied", () => {
  assert.equal(lightboxCopyOffered({ url: "" }), false);
  assert.equal(lightboxCopyOffered({ url: "  " }), false);
  assert.equal(lightboxCopyOffered({ url: "/v1/attachments/a" }), true);
  assert.equal(lightboxCopyOffered({ url: "", hasBytes: true }), true);

  assert.equal(lightboxCopyMimeType({ blobType: "image/png" }), "image/png");
  assert.equal(lightboxCopyMimeType({ blobType: "image/jpeg; charset=binary" }), "image/jpeg");
  assert.equal(lightboxCopyMimeType({ blobType: "image/jpg" }), "image/jpeg");
  assert.equal(lightboxCopyMimeType({ blobType: "image/gif" }), "image/gif");
  assert.equal(lightboxCopyMimeType({ blobType: "image/webp" }), "image/webp");
  assert.equal(lightboxCopyMimeType({ blobType: "image/svg+xml" }), null);
  assert.equal(lightboxCopyMimeType({ blobType: "text/plain", sniffed: "png" }), "image/png");
  assert.equal(lightboxCopyMimeType({ sniffed: "jpg" }), "image/jpeg");
  assert.equal(lightboxCopyMimeType({ sniffed: "jpeg" }), "image/jpeg");
  assert.equal(lightboxCopyMimeType({ sniffed: "gif" }), "image/gif");
  assert.equal(lightboxCopyMimeType({ sniffed: "webp" }), "image/webp");
  assert.equal(lightboxCopyMimeType({ sniffed: "bmp" }), "image/bmp");
  assert.equal(lightboxCopyMimeType({ sniffed: "svg" }), null);
  assert.equal(lightboxCopyMimeType({}), null);
  assert.equal(
    lightboxCopyMimeType({ blobType: "image/png", sniffed: "jpg" }),
    "image/png",
  );
});

test("the clipboard blob keeps the image type and drops an empty body", async () => {
  const png = new Blob([Uint8Array.from([0x89, 0x50])], { type: "image/png" });
  const same = await lightboxCopyBlob(png, "image/png");
  assert.equal(same, png);
  const untyped = new Blob([Uint8Array.from([0xff, 0xd8])]);
  const typed = await lightboxCopyBlob(untyped, "image/jpeg");
  assert.ok(typed);
  assert.equal(typed?.type, "image/jpeg");
  assert.equal(typed?.size, 2);
  assert.equal(await lightboxCopyBlob(png, ""), null);
  assert.equal(await lightboxCopyBlob(new Blob([]), "image/png"), null);
});

test("Tab reaches Copy just before Save", () => {
  assert.deepEqual(
    lightboxZoomFocusOrder({
      saveOffered: true,
      canZoomOut: true,
      canZoomIn: true,
    }),
    ["zoomOut", "zoomIn", "copy", "save", "close"],
  );
  assert.deepEqual(
    lightboxZoomFocusOrder({
      saveOffered: false,
      canZoomOut: true,
      canZoomIn: true,
    }),
    ["zoomOut", "zoomIn", "close"],
  );
});

test("desktop Copy sits with Save and does not dismiss or send", () => {
  assert.match(app, /from "\.\/lightboxCopy"/);
  assert.match(app, /className="image-lightbox-copy"/);
  assert.match(app, /aria-label=\{lightboxCopyAria\(lightboxCopied\)\}/);
  assert.match(app, /lightboxCopyLabel\(lightboxCopied\)/);
  assert.match(app, /onClick=\{\(\) => void copyLightboxImage\(\)\}/);
  assert.match(app, /lightboxCopyRef/);
  assert.match(app, /next === "copy"/);

  const copy = sliceFn(
    app,
    "async function copyLightboxImage()",
    "async function saveLightboxImage()",
  );
  assert.match(copy, /lightboxCopyKeepsOpen\(\)/);
  assert.match(copy, /readLightboxImageBlob\(/);
  assert.match(copy, /lightboxCopyMimeType\(/);
  assert.match(copy, /lightboxCopyBlob\(/);
  assert.match(copy, /navigator\.clipboard\.write/);
  assert.match(copy, /LIGHTBOX_COPY_MS/);
  assert.match(copy, /setLightboxCopied\(true\)/);
  assert.doesNotMatch(copy, /closeImageLightbox|removePending|setLightboxTarget\(/);
  assert.doesNotMatch(copy, /\.send\(/);

  const stepped = sliceFn(
    app,
    "const id = lightboxFrame?.id ?? null;",
    "useEffect(() => {\n    const onKey",
  );
  assert.match(stepped, /setLightboxCopied\(false\)/);
  assert.match(stepped, /lightboxCopyTimer/);

  assert.match(css, /\.image-lightbox-copy,/);
  assert.match(css, /font-size:\s*12px/);
  const copyRule = css.slice(css.indexOf(".image-lightbox-copy,"));
  const body = copyRule.slice(0, copyRule.indexOf("}"));
  assert.doesNotMatch(body, /transition|animation/);
  assert.match(shortcuts, /Copy the last reply/);
  assert.doesNotMatch(shortcuts, /Copy image/);
  assert.match(src, /No new HTTP/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
});

test("iOS Copy writes the pasteboard and keeps the overlay up", () => {
  assert.match(swift, /static let label = "Copy"/);
  assert.match(swift, /static let copiedLabel = "Copied"/);
  assert.match(swift, /static let accessibilityLabel = "Copy image"/);
  assert.match(swift, /static let feedbackMs: UInt64 = 1200/);
  assert.match(swift, /static func keepsOpen\(\) -> Bool \{ true \}/);
  assert.match(swift, /return false/);
  assert.match(swift, /UIPasteboard\.general\.image = image/);
  assert.doesNotMatch(swift, /PHPhotoLibrary/);
  assert.doesNotMatch(swift, /requestAuthorization/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(overlay, /Button\(copied \? LightboxCopy\.copiedLabel : LightboxCopy\.label\)/);
  assert.match(overlay, /LightboxCopy\.accessibilityLabel/);
  assert.match(overlay, /LightboxCopy\.keepsOpen\(\)/);
  assert.match(overlay, /LightboxCopy\.writeToPasteboard\(imageData\)/);
  assert.match(overlay, /LightboxCopy\.feedbackNanoseconds/);
  assert.match(overlay, /!LightboxCopy\.animates\(reduceMotion: reduceMotion\)/);
  const copyFn = sliceFn(overlay, "private func copyImage()", "private func saveImage()");
  assert.doesNotMatch(copyFn, /onClose\(\)|removePending|model\.send\(/);
  const load = sliceFn(overlay, "private func load() async", "if let local");
  assert.match(load, /copied = false/);
  assert.match(load, /copyGeneration \+= 1/);
});

test("OpenAPI stays 0.18.0 and v2.18 is documented", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /lightboxCopy\.test\.ts/);
  assert.match(ci, /test_ios_lightbox_copy\.py/);
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 218\. v2\.18/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
  assert.match(spec, /9136e72/);
});
