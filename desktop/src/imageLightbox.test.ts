// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  IMAGE_LIGHTBOX_CLOSE,
  IMAGE_LIGHTBOX_FADE_MS,
  IMAGE_LIGHTBOX_LABEL,
  LIGHTBOX_HIDDEN,
  escapeClosesLightbox,
  isLightboxImage,
  lightboxAppear,
  lightboxDismiss,
  lightboxFadeMs,
  lightboxLabel,
  lightboxShown,
} from "./imageLightbox.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "imageLightbox.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ImageLightbox.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE =
  "v0.79 image lightbox (click or tap an image on a user-RIGHT or assistant-LEFT kind=message opens a full-size overlay; dimmed backdrop; Close; Esc or a click or tap outside dismisses; iOS swipe-down dismisses; videos stay the player; file chips stay; Reduce Motion is instant show/hide; focus returns to that image; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function reducedMotionBlocks(): string[] {
  const needle = "@media (prefers-reduced-motion: reduce)";
  const out: string[] = [];
  let from = 0;
  while (true) {
    const idx = css.indexOf(needle, from);
    if (idx < 0) break;
    const start = css.indexOf("{", idx);
    let depth = 0;
    let end = start;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push(css.slice(idx, end + 1));
    from = end + 1;
  }
  return out;
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("only image attachments open the lightbox", () => {
  assert.equal(isLightboxImage("image"), true);
  assert.equal(isLightboxImage("video"), false);
  assert.equal(isLightboxImage("file"), false);
  assert.equal(lightboxLabel("shot.png"), "shot.png");
  assert.equal(lightboxLabel("  "), IMAGE_LIGHTBOX_LABEL);
  assert.equal(IMAGE_LIGHTBOX_CLOSE, "Close");
  assert.equal(IMAGE_LIGHTBOX_LABEL, "Image");
  assert.equal(
    escapeClosesLightbox({ open: true, composing: false }),
    true,
  );
  assert.equal(escapeClosesLightbox({ open: false, composing: false }), false);
  assert.equal(escapeClosesLightbox({ open: true, composing: true }), false);
});

test("overlay fade is 120ms opacity and instant under Reduce Motion", () => {
  assert.equal(IMAGE_LIGHTBOX_FADE_MS, 120);
  assert.equal(lightboxFadeMs(false), 120);
  assert.equal(lightboxFadeMs(true), 0);
  assert.deepEqual(lightboxAppear(false), { mounted: true, shown: false });
  assert.deepEqual(lightboxAppear(true), { mounted: true, shown: true });
  assert.deepEqual(lightboxShown(), { mounted: true, shown: true });
  assert.deepEqual(lightboxDismiss(false), { mounted: true, shown: false });
  assert.deepEqual(lightboxDismiss(true), LIGHTBOX_HIDDEN);

  const backdrop = block(".image-lightbox-backdrop");
  assert.match(backdrop, /opacity:\s*0/);
  assert.match(backdrop, /background:\s*rgba\(0,\s*0,\s*0,\s*0\.72\)/);
  assert.match(backdrop, /transition:\s*opacity\s+120ms/);
  const shown = block('.image-lightbox-backdrop[data-shown="true"]');
  assert.match(shown, /opacity:\s*1/);
  const image = block(".image-lightbox-image");
  assert.match(image, /object-fit:\s*contain/);
  assert.match(image, /max-height:\s*calc\(100vh - 96px\)/);
  const close = block(".image-lightbox-close");
  assert.match(close, /font-size:\s*12px/);

  const reduce = reducedMotionBlocks().find((entry) =>
    entry.includes(".image-lightbox-backdrop"),
  );
  assert.ok(reduce, "missing Reduce Motion rule for the image lightbox");
  assert.match(reduce, /\.image-lightbox-backdrop\s*\{[^}]*transition:\s*none/);
  assert.doesNotMatch(
    reduce.slice(reduce.indexOf(".image-lightbox-backdrop")),
    /opacity\s+120ms/,
  );
});

test("desktop click opens the overlay; Esc, outside, and Close dismiss it", () => {
  assert.match(app, /from "\.\/imageLightbox"/);
  assert.match(app, /isLightboxImage\(row\.kind\)/);
  assert.match(app, /className="bubble-image-btn"/);
  assert.match(app, /className="image-lightbox-backdrop"/);
  assert.match(app, /className="image-lightbox"/);
  assert.match(app, /className="image-lightbox-close"/);
  assert.match(app, /className="image-lightbox-image"/);
  assert.match(app, /IMAGE_LIGHTBOX_CLOSE/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /data-shown=\{lightboxPaint\.shown \? "true" : "false"\}/);
  assert.match(app, /onMouseDown=\{\(\) => closeImageLightbox\(\)\}/);
  assert.match(app, /lightboxCloseRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /back\?\.isConnected/);
  assert.match(app, /back\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /focusComposer\(\)/);

  const chrome = sliceFn(app, "function MessageAttachmentChrome", "function AuthedImg");
  assert.match(chrome, /className="bubble-image-btn"/);
  assert.match(chrome, /AuthedVideo/);
  assert.match(chrome, /className="file-chip"/);
  const videos = sliceFn(chrome, "videos.map", "files.map");
  assert.doesNotMatch(videos, /bubble-image-btn/);
  assert.match(videos, /AuthedVideo/);
  const files = chrome.slice(chrome.indexOf("files.map"));
  assert.match(files, /className="file-chip"/);
  assert.doesNotMatch(files, /bubble-image-btn/);
  assert.doesNotMatch(files, /openImageLightbox/);

  const lightboxEsc = app.indexOf("escapeClosesLightbox({");
  const dropEsc = app.indexOf("escapeClearsFileDrop(dropTargetRef.current)");
  assert.ok(lightboxEsc >= 0 && dropEsc > lightboxEsc);
  const esc = app.slice(lightboxEsc, dropEsc);
  assert.match(esc, /stopImmediatePropagation\(\)/);
  assert.match(esc, /addEventListener\("keydown", onKey, true\)/);

  assert.match(app, /lightboxAppear\(reduce\)/);
  assert.match(app, /lightboxShown\(\)/);
  assert.match(app, /lightboxDismiss\(reduce\)/);
  assert.match(app, /lightboxFadeMs\(reduce\)/);
  assert.match(app, /LIGHTBOX_HIDDEN/);
  assert.match(src, /Instant when Reduce Motion/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("iOS tap, swipe-down, and Reduce Motion match the desktop overlay", () => {
  assert.match(swift, /static let close = "Close"/);
  assert.match(swift, /static let fadeMs: Double = 120/);
  assert.match(swift, /kind == \.image/);
  assert.match(swift, /translation\.height > 80/);
  assert.match(swift, /reduceMotion \? nil/);
  assert.match(swift, /transaction\.animation = nil/);
  assert.match(swift, /onTapGesture \{ onClose\(\) \}/);
  assert.match(swift, /\.onExitCommand\(perform: onClose\)/);
  assert.match(swift, /keyboardShortcut\(\.cancelAction\)/);
  assert.match(swift, /DragGesture/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /ImageLightboxOverlay\(/);
  assert.match(chat, /ImageLightbox\.isImage/);
  assert.match(chat, /openLightbox\(/);
  assert.match(chat, /closeLightbox\(/);
  assert.match(chat, /ImageLightbox\.escapeCloses/);
  assert.match(chat, /accessibilityReduceMotion/);
  const videos = sliceFn(chat, "ForEach(videos)", "if images.isEmpty && videos.isEmpty");
  assert.match(videos, /RemoteVideo/);
  assert.doesNotMatch(videos, /openLightbox|onOpenImage/);
});

test("OpenAPI stays 0.18.0; v0.79 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /imageLightbox\.test\.ts/);
  assert.match(ci, /test_ios_image_lightbox\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /v0\.79/);
});
