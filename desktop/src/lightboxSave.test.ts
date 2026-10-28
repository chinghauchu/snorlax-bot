// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LIGHTBOX_SAVE_ARIA,
  LIGHTBOX_SAVE_LABEL,
  lightboxFocusOrder,
  lightboxSaveAnimates,
  lightboxSaveFilename,
  lightboxSaveKeepsOpen,
  lightboxSaveOffered,
  nextLightboxFocus,
  sniffImageExtension,
} from "./lightboxSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "lightboxSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "LightboxSave.swift"),
  "utf8",
);
const overlay = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ImageLightbox.swift"),
  "utf8",
);

const PHRASE = "v2.11 save the image from the lightbox";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("Save is offered for a URL or for bytes already in hand", () => {
  assert.equal(LIGHTBOX_SAVE_LABEL, "Save");
  assert.equal(LIGHTBOX_SAVE_ARIA, "Save image");
  assert.equal(lightboxSaveOffered({ url: "blob:preview" }), true);
  assert.equal(lightboxSaveOffered({ url: "  /v1/agents/a/attachments/x " }), true);
  assert.equal(lightboxSaveOffered({ url: "   " }), false);
  assert.equal(lightboxSaveOffered({ url: "", hasBytes: true }), true);
  assert.equal(lightboxSaveKeepsOpen(), true);
  assert.equal(lightboxSaveAnimates(false), false);
  assert.equal(lightboxSaveAnimates(true), false);
  assert.deepEqual(lightboxFocusOrder(true), ["save", "close"]);
  assert.deepEqual(lightboxFocusOrder(false), ["close"]);
});

test("Tab moves between Save and Close and wraps", () => {
  const both = lightboxFocusOrder(true);
  assert.equal(nextLightboxFocus(both, null, false), "save");
  assert.equal(nextLightboxFocus(both, "save", false), "close");
  assert.equal(nextLightboxFocus(both, "close", false), "save");
  assert.equal(nextLightboxFocus(both, "close", true), "save");
  assert.equal(nextLightboxFocus(both, "save", true), "close");
  const closeOnly = lightboxFocusOrder(false);
  assert.equal(nextLightboxFocus(closeOnly, null, false), "close");
  assert.equal(nextLightboxFocus(closeOnly, "close", false), "close");
  assert.equal(nextLightboxFocus(closeOnly, "close", true), "close");
});

test("the file name keeps an image extension and sniffs bytes otherwise", () => {
  assert.equal(lightboxSaveFilename("shot.png", "blob:preview"), "shot.png");
  assert.equal(lightboxSaveFilename("shot.PNG", "blob:preview", "jpg"), "shot.PNG");
  assert.equal(lightboxSaveFilename("  my shot.jpg  ", ""), "my shot.jpg");
  assert.equal(
    lightboxSaveFilename("photo", "https://spark.local/a/shot.JPEG?token=1#x"),
    "photo.jpeg",
  );
  assert.equal(
    lightboxSaveFilename("Image", "blob:http://localhost/uuid", "jpg"),
    "Image.jpg",
  );
  assert.equal(
    lightboxSaveFilename("", "data:image/jpeg;base64,aaaa"),
    "Image.jpg",
  );
  assert.equal(
    lightboxSaveFilename("Image", "data:image/svg+xml;base64,aaaa"),
    "Image.svg",
  );
  assert.equal(lightboxSaveFilename("notes.txt", "blob:preview"), "notes.txt.png");
  assert.equal(
    lightboxSaveFilename("../../etc/passwd.png", "blob:preview"),
    "passwd.png",
  );
  assert.equal(lightboxSaveFilename("a\u0000b.gif", ""), "ab.gif");
  assert.equal(lightboxSaveFilename("..", "blob:preview", "exe"), "Image.png");
  assert.equal(lightboxSaveFilename("   ", "", "gif"), "Image.gif");

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const webp = new Uint8Array(12);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  const bmp = new Uint8Array([0x42, 0x4d, 0x00]);
  assert.equal(sniffImageExtension(png), "png");
  assert.equal(sniffImageExtension(jpg), "jpg");
  assert.equal(sniffImageExtension(gif), "gif");
  assert.equal(sniffImageExtension(webp), "webp");
  assert.equal(sniffImageExtension(bmp), "bmp");
  assert.equal(sniffImageExtension(new Uint8Array([0x00, 0x01])), null);
  assert.equal(sniffImageExtension(new Uint8Array()), null);
});

test("desktop Save sits beside Close and does not dismiss or send", () => {
  assert.match(app, /from "\.\/lightboxSave"/);
  assert.match(app, /className="image-lightbox-actions"/);
  assert.match(app, /className="image-lightbox-save"/);
  assert.match(app, /aria-label=\{LIGHTBOX_SAVE_ARIA\}/);
  assert.match(app, /LIGHTBOX_SAVE_LABEL/);
  assert.match(app, /onClick=\{\(\) => void saveLightboxImage\(\)\}/);
  assert.match(app, /nextLightboxFocus\(order, current, event\.shiftKey\)/);
  assert.match(app, /lightboxCloseRef\.current\?\.focus\(\{ preventScroll: true \}\)/);

  const save = sliceFn(app, "async function saveLightboxImage()", "useEffect(() => {");
  assert.match(save, /lightboxSaveKeepsOpen\(\)/);
  assert.match(save, /readLightboxImageBlob\(frame\.url, session\)/);
  assert.match(save, /sniffImageExtension\(/);
  assert.match(save, /downloadLightboxBlob\(/);
  assert.match(save, /lightboxSaveFilename\(frame\.name, frame\.url, sniffed\)/);
  assert.doesNotMatch(save, /closeImageLightbox|removePending|setLightboxTarget\(/);
  assert.doesNotMatch(save, /\.send\(/);

  const rule = block(".image-lightbox-save");
  assert.match(rule, /font-size:\s*12px/);
  assert.doesNotMatch(rule, /transition|animation/);
  const actions = block(".image-lightbox-actions");
  assert.match(actions, /display:\s*flex/);
  assert.match(src, /No new animation/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
});

test("iOS Save uses the share sheet and the same file name rules", () => {
  assert.match(swift, /static let label = "Save"/);
  assert.match(swift, /static let accessibilityLabel = "Save image"/);
  assert.match(swift, /static func keepsOpen\(\) -> Bool \{ true \}/);
  assert.match(swift, /return false/);
  assert.match(swift, /0x89, 0x50, 0x4E, 0x47/);
  assert.match(swift, /0xFF, 0xD8, 0xFF/);
  assert.match(swift, /0x47, 0x49, 0x46/);
  assert.match(swift, /0x52, 0x49, 0x46, 0x46/);
  assert.match(swift, /0x57/);
  assert.match(swift, /0x42, 0x4D/);
  assert.match(swift, /photo-library permission/);
  assert.doesNotMatch(swift, /PHPhotoLibrary|requestAuthorization/);
  assert.doesNotMatch(swift, /\/v1\//);

  assert.match(overlay, /Button\(LightboxSave\.label\)/);
  assert.match(overlay, /LightboxSave\.accessibilityLabel/);
  assert.match(overlay, /LightboxSave\.keepsOpen\(\)/);
  assert.match(overlay, /LightboxSave\.filename\(/);
  assert.match(overlay, /LightboxSave\.sniffExtension\(imageData\)/);
  assert.match(overlay, /UIActivityViewController/);
  assert.match(overlay, /!LightboxSave\.animates\(reduceMotion: reduceMotion\)/);
  const save = sliceFn(overlay, "private func saveImage()", "private func load()");
  assert.doesNotMatch(save, /onClose\(\)|removePending/);
  assert.doesNotMatch(overlay, /PHPhotoLibrary|requestAuthorization/);
  assert.doesNotMatch(overlay, /\/v1\//);
});

test("OpenAPI stays 0.18.0 and v2.11 is documented", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /lightboxSave\.test\.ts/);
  assert.match(ci, /test_ios_lightbox_save\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v2\.11 /);
  assert.match(spec, /## 211\. v2\.11 — save the image from the lightbox/);
  assert.match(spec, /Checked v0\.79 and v2\.10 on main at 80177eb/);
});
