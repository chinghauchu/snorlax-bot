// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { nextLightboxFocus } from "./lightboxSave.ts";
import {
  LIGHTBOX_WHEEL_NOTCH,
  LIGHTBOX_ZOOM_DOUBLE,
  LIGHTBOX_ZOOM_FIT,
  LIGHTBOX_ZOOM_IN_ARIA,
  LIGHTBOX_ZOOM_IN_LABEL,
  LIGHTBOX_ZOOM_MAX,
  LIGHTBOX_ZOOM_MIN,
  LIGHTBOX_ZOOM_OUT_ARIA,
  LIGHTBOX_ZOOM_OUT_LABEL,
  LIGHTBOX_ZOOM_STEP,
  LIGHTBOX_ZOOM_TRANSITION_MS,
  lightboxDoubleClickZooms,
  lightboxPanEnabled,
  lightboxPanLimits,
  lightboxSwipeDismissAllowed,
  lightboxZoomApplied,
  lightboxZoomCanIn,
  lightboxZoomCanOut,
  lightboxZoomFocusOrder,
  lightboxZoomFromPinch,
  lightboxZoomIn,
  lightboxZoomKeepsOpen,
  lightboxZoomKey,
  lightboxZoomOut,
  lightboxZoomPanned,
  lightboxZoomPinched,
  lightboxZoomToggle,
  lightboxZoomTransitionMs,
  lightboxZoomWheeled,
} from "./lightboxZoom.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "lightboxZoom.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "LightboxZoom.swift"),
  "utf8",
);
const overlay = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ImageLightbox.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE = "v2.12 zoom an image in the lightbox";
const fitted = { width: 200, height: 100 };

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

test("zoom steps from fit to 4× and back, and double-click toggles 2×", () => {
  assert.equal(LIGHTBOX_ZOOM_MIN, 1);
  assert.equal(LIGHTBOX_ZOOM_MAX, 4);
  assert.equal(LIGHTBOX_ZOOM_STEP, 0.5);
  assert.equal(LIGHTBOX_ZOOM_DOUBLE, 2);
  assert.equal(LIGHTBOX_ZOOM_IN_LABEL, "Zoom in");
  assert.equal(LIGHTBOX_ZOOM_OUT_LABEL, "Zoom out");
  assert.equal(LIGHTBOX_ZOOM_IN_ARIA, "Zoom in");
  assert.equal(LIGHTBOX_ZOOM_OUT_ARIA, "Zoom out");
  assert.equal(lightboxZoomKeepsOpen(), true);
  assert.equal(lightboxZoomTransitionMs(false, false), LIGHTBOX_ZOOM_TRANSITION_MS);
  assert.equal(lightboxZoomTransitionMs(true, false), 0);
  assert.equal(lightboxZoomTransitionMs(false, true), 0);

  let zoom = { ...LIGHTBOX_ZOOM_FIT };
  assert.equal(lightboxZoomCanOut(zoom.scale), false);
  assert.equal(lightboxZoomCanIn(zoom.scale), true);
  assert.equal(lightboxPanEnabled(zoom.scale), false);
  assert.equal(lightboxSwipeDismissAllowed(zoom.scale), true);
  zoom = lightboxZoomOut(zoom);
  assert.deepEqual(zoom, LIGHTBOX_ZOOM_FIT);

  for (const scale of [1.5, 2, 2.5, 3, 3.5, 4]) {
    zoom = lightboxZoomIn(zoom);
    assert.equal(zoom.scale, scale);
  }
  assert.equal(lightboxZoomCanIn(zoom.scale), false);
  assert.deepEqual(lightboxZoomIn(zoom), zoom);
  zoom = lightboxZoomOut(zoom);
  assert.equal(zoom.scale, 3.5);
  assert.equal(lightboxSwipeDismissAllowed(2), false);
  assert.deepEqual(lightboxZoomToggle({ scale: 1, x: 4, y: 4 }), {
    scale: 2,
    x: 0,
    y: 0,
  });
  assert.deepEqual(lightboxZoomToggle({ scale: 3.5, x: 8, y: 8 }), LIGHTBOX_ZOOM_FIT);
  assert.equal(lightboxDoubleClickZooms(2), true);
  assert.equal(lightboxDoubleClickZooms(1), false);
});

test("pan stays inside the scaled picture and pinch clamps to 4×", () => {
  assert.deepEqual(lightboxPanLimits(fitted, 1), { maxX: 0, maxY: 0 });
  assert.deepEqual(lightboxPanLimits(fitted, 2), { maxX: 100, maxY: 50 });
  const panned = lightboxZoomPanned(2, 0, 0, 1000, -1000, fitted);
  assert.deepEqual(panned, { scale: 2, x: 100, y: -50 });
  assert.deepEqual(lightboxZoomPanned(1, 0, 0, 40, 40, fitted), LIGHTBOX_ZOOM_FIT);
  assert.equal(lightboxZoomFromPinch(2, 3), 4);
  assert.equal(lightboxZoomFromPinch(2, 0.1), 1);
  assert.equal(lightboxZoomFromPinch(2, 0), 2);
  assert.equal(lightboxZoomFromPinch(Number.NaN, 2), 1);
  const pinched = lightboxZoomPinched(2, 0.1, 80, 80, fitted);
  assert.deepEqual(pinched, LIGHTBOX_ZOOM_FIT);
  const held = lightboxZoomApplied(
    { scale: 2, x: 80, y: 40 },
    "in",
    fitted,
  );
  assert.equal(held.scale, 2.5);
  assert.equal(held.x, 80);
  assert.equal(held.y, 40);
  assert.deepEqual(
    lightboxZoomApplied({ scale: 1.5, x: 10, y: 10 }, "out", fitted),
    LIGHTBOX_ZOOM_FIT,
  );
});

test("the wheel takes one step per notch and keys ignore Cmd", () => {
  assert.equal(LIGHTBOX_WHEEL_NOTCH, 48);
  const small = lightboxZoomWheeled(LIGHTBOX_ZOOM_FIT, -20, 0, fitted);
  assert.equal(small.zoom.scale, 1);
  assert.equal(small.pending, -20);
  const notch = lightboxZoomWheeled(small.zoom, -40, small.pending, fitted);
  assert.equal(notch.zoom.scale, 1.5);
  assert.equal(notch.pending, -12);
  const flick = lightboxZoomWheeled(LIGHTBOX_ZOOM_FIT, -400, 0, fitted);
  assert.equal(flick.zoom.scale, 1.5);
  assert.equal(flick.pending, 0);
  const out = lightboxZoomWheeled({ scale: 2, x: 0, y: 0 }, 100, 0, fitted);
  assert.equal(out.zoom.scale, 1.5);

  assert.equal(lightboxZoomKey({ key: "+" }), "in");
  assert.equal(lightboxZoomKey({ key: "=" }), "in");
  assert.equal(lightboxZoomKey({ key: "-" }), "out");
  assert.equal(lightboxZoomKey({ key: "_" }), "out");
  assert.equal(lightboxZoomKey({ key: "0" }), "fit");
  assert.equal(lightboxZoomKey({ key: "0", shiftKey: true }), null);
  assert.equal(lightboxZoomKey({ key: "=", metaKey: true }), null);
  assert.equal(lightboxZoomKey({ key: "-", ctrlKey: true }), null);
  assert.equal(lightboxZoomKey({ key: "+", altKey: true }), null);
  assert.equal(lightboxZoomKey({ key: "a" }), null);
});

test("Tab skips a zoom button that is at its limit", () => {
  const mid = lightboxZoomFocusOrder({
    saveOffered: true,
    canZoomOut: true,
    canZoomIn: true,
  });
  assert.deepEqual(mid, ["zoomOut", "zoomIn", "copy", "save", "close"]);
  assert.equal(nextLightboxFocus(mid, "close", false), "zoomOut");
  assert.equal(nextLightboxFocus(mid, "zoomOut", true), "close");
  const fit = lightboxZoomFocusOrder({
    saveOffered: true,
    canZoomOut: false,
    canZoomIn: true,
  });
  assert.deepEqual(fit, ["zoomIn", "copy", "save", "close"]);
  assert.equal(nextLightboxFocus(fit, null, false), "zoomIn");
  const maxed = lightboxZoomFocusOrder({
    saveOffered: false,
    canZoomOut: true,
    canZoomIn: false,
  });
  assert.deepEqual(maxed, ["zoomOut", "close"]);
  assert.equal(nextLightboxFocus(maxed, "zoomOut", false), "close");
});

test("desktop zoom sits with Save and does not dismiss or send", () => {
  assert.match(app, /from "\.\/lightboxZoom"/);
  assert.match(app, /className="image-lightbox-zoom"/);
  assert.match(app, /aria-label=\{LIGHTBOX_ZOOM_IN_ARIA\}/);
  assert.match(app, /aria-label=\{LIGHTBOX_ZOOM_OUT_ARIA\}/);
  assert.match(app, /LIGHTBOX_ZOOM_IN_LABEL/);
  assert.match(app, /LIGHTBOX_ZOOM_OUT_LABEL/);
  assert.match(app, /disabled=\{!lightboxZoomCanOut\(lightboxZoom\.scale\)\}/);
  assert.match(app, /disabled=\{!lightboxZoomCanIn\(lightboxZoom\.scale\)\}/);
  assert.match(app, /commitLightboxZoomRef\.current\("in"\)/);
  assert.match(app, /commitLightboxZoomRef\.current\("out"\)/);
  assert.match(app, /commitLightboxZoomRef\.current\("toggle"\)/);
  assert.match(app, /lightboxZoomWheeled\(/);
  assert.match(app, /passive: false/);
  assert.match(app, /nextLightboxFocus\(order, current, event\.shiftKey\)/);
  assert.match(app, /lightboxZoomKey\(/);
  assert.match(app, /stopImmediatePropagation\(\)/);

  const zoomBtn = sliceFn(app, 'className="image-lightbox-zoom"', "LIGHTBOX_SAVE_LABEL");
  assert.doesNotMatch(zoomBtn, /closeImageLightbox|removePending|\.send\(/);

  const rule = block(".image-lightbox-zoom");
  assert.match(rule, /font-size:\s*12px/);
  assert.doesNotMatch(rule, /transition|animation/);
  const motion = block('.image-lightbox-image[data-zoom-animate="true"]');
  assert.match(motion, /transition:\s*transform\s+120ms/);
  assert.match(src, /No new HTTP/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
});

test("iOS pinch, double-tap, and the same limits", () => {
  assert.match(swift, /static let zoomInLabel = "Zoom in"/);
  assert.match(swift, /static let zoomOutLabel = "Zoom out"/);
  assert.match(swift, /static let minScale: Double = 1/);
  assert.match(swift, /static let maxScale: Double = 4/);
  assert.match(swift, /static let step: Double = 0.5/);
  assert.match(swift, /static let doubleScale: Double = 2/);
  assert.match(swift, /static let wheelNotch: Double = 48/);
  assert.match(swift, /static func keepsOpen\(\) -> Bool \{ true \}/);
  assert.match(swift, /Double-tap to zoom/);
  assert.match(swift, /Double-tap to fit/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(overlay, /Button\(LightboxZoom\.zoomOutLabel\)/);
  assert.match(overlay, /Button\(LightboxZoom\.zoomInLabel\)/);
  assert.match(overlay, /LightboxZoom\.zoomOutAccessibility/);
  assert.match(overlay, /LightboxZoom\.zoomInAccessibility/);
  assert.match(overlay, /MagnificationGesture/);
  assert.match(overlay, /TapGesture\(count: 2\)/);
  assert.match(overlay, /allowsSwipeDismiss\(scale: zoom\.scale\)/);
  assert.match(overlay, /translation\.height > 80/);
  assert.match(overlay, /LightboxZoom\.keepsOpen\(\)/);
  assert.match(chat, /lightboxZoomKey\(press\)/);
  assert.match(chat, /LightboxZoom\.keyAction/);
  const zoomFn = sliceFn(overlay, "private func applyZoom", "private func picture");
  assert.doesNotMatch(zoomFn, /onClose\(\)|removePending|model\.send\(/);
});

test("OpenAPI stays 0.18.0 and v2.12 is documented", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /lightboxZoom\.test\.ts/);
  assert.match(ci, /test_ios_lightbox_zoom\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v2\.12 /);
  assert.match(spec, /## 212\. v2\.12 — zoom an image in the lightbox/);
  assert.match(spec, /Checked v0\.79, v2\.10, and v2\.11 on main at bdfa32a/);
});
