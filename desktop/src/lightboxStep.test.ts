// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { nextLightboxFocus } from "./lightboxSave.ts";
import { lightboxZoomFocusOrder } from "./lightboxZoom.ts";
import {
  LIGHTBOX_STEP_NEXT,
  LIGHTBOX_STEP_NEXT_ARIA,
  LIGHTBOX_STEP_PREVIOUS,
  LIGHTBOX_STEP_PREVIOUS_ARIA,
  LIGHTBOX_STEP_SWIPE,
  lightboxCanStep,
  lightboxImageStrip,
  lightboxMessageBubbles,
  lightboxShowsChrome,
  lightboxStepAnimates,
  lightboxStepFocusOrder,
  lightboxStepIndex,
  lightboxStepKeepsOpen,
  lightboxStepKey,
  lightboxStepPosition,
  lightboxStepTarget,
  lightboxSwipeSteps,
  markdownLightboxId,
  type LightboxStripMessage,
} from "./lightboxStep.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const images = readFileSync(join(here, "markdownImageView.tsx"), "utf8");
const src = readFileSync(join(here, "lightboxStep.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "LightboxStep.swift"),
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
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");

const PHRASE = "v2.13 step between images in the lightbox";

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

function message(partial: Partial<LightboxStripMessage> & { id: string }): LightboxStripMessage {
  return {
    content: "",
    senderId: "snorlax-bot",
    senderName: "Snorlax",
    role: "assistant",
    kind: "message",
    completed: true,
    ...partial,
  };
}

test("previous and next walk the open chat and stop at the ends", () => {
  assert.equal(LIGHTBOX_STEP_PREVIOUS, "Previous");
  assert.equal(LIGHTBOX_STEP_NEXT, "Next");
  assert.equal(LIGHTBOX_STEP_PREVIOUS_ARIA, "Previous image");
  assert.equal(LIGHTBOX_STEP_NEXT_ARIA, "Next image");
  assert.equal(LIGHTBOX_STEP_SWIPE, 80);
  assert.equal(lightboxStepKeepsOpen(), true);
  assert.equal(lightboxStepAnimates(), false);
  assert.equal(
    markdownLightboxId("m", 1, "https://cdn.example/a.png", 0),
    "md:m:1:0:https://cdn.example/a.png",
  );

  const strip = lightboxImageStrip({
    baseUrl: "http://127.0.0.1:8787",
    channelTimeline: false,
    pending: [
      {
        id: "pend",
        kind: "image",
        name: "draft.png",
        previewUrl: "blob:draft",
      },
      { id: "clip", kind: "video", name: "clip.mp4", previewUrl: "blob:clip" },
      { id: "note", kind: "file", name: "note.txt", previewUrl: null },
    ],
    messages: [
      message({
        id: "u",
        senderId: "user",
        role: "user",
        content: "![skip](https://cdn.example/user.png)",
        attachments: [
          { id: "shot", kind: "image", name: "shot.png", url: "/v1/attachments/shot" },
          { id: "vid", kind: "video", name: "v.mp4", url: "/v1/attachments/v" },
          { id: "file", kind: "file", name: "a.txt", url: "/v1/attachments/a" },
        ],
      }),
      message({
        id: "a",
        content:
          "![cat](https://cdn.example/cat.png)\n\n![cat](https://cdn.example/cat.png)",
        attachments: [
          { id: "board", kind: "image", name: "board.png", url: "/v1/attachments/board" },
        ],
      }),
      message({
        id: "live",
        completed: false,
        content: "![soon](https://cdn.example/soon.png)",
        attachments: [
          { id: "live-shot", kind: "image", name: "live.png", url: "/v1/attachments/live" },
        ],
      }),
      message({ id: "tool", kind: "tool", content: "ran" }),
    ],
  });

  assert.deepEqual(
    strip.map((item) => item.id),
    [
      "shot",
      "board",
      "md:a:0:0:https://cdn.example/cat.png",
      "md:a:1:0:https://cdn.example/cat.png",
      "live-shot",
      "pend",
    ],
  );
  assert.equal(strip[0]?.url, "http://127.0.0.1:8787/v1/attachments/shot");
  assert.equal(strip[1]?.name, "board.png");
  assert.equal(strip[2]?.name, "cat");
  assert.equal(lightboxStepPosition(0, 1), null);
  assert.equal(lightboxStepPosition(0, strip.length), "1 of 6");
  assert.equal(lightboxStepPosition(5, strip.length), "6 of 6");
  assert.equal(lightboxStepIndex(strip, "missing"), -1);
  assert.equal(lightboxCanStep(0, strip.length, "previous"), false);
  assert.equal(lightboxCanStep(0, strip.length, "next"), true);
  assert.equal(lightboxCanStep(5, strip.length, "next"), false);
  assert.equal(lightboxStepTarget(strip, "shot", "previous"), null);
  assert.equal(lightboxStepTarget(strip, "shot", "next")?.id, "board");
  assert.equal(lightboxStepTarget(strip, "pend", "next"), null);
  assert.equal(lightboxStepTarget(strip, "missing", "next"), null);

  const hidden = lightboxImageStrip({
    baseUrl: "",
    channelTimeline: true,
    pending: [],
    messages: [
      message({
        id: "hand",
        kind: "handoff",
        attachments: [{ id: "x", kind: "image", name: "x.png", url: "/v1/attachments/x" }],
      }),
    ],
  });
  assert.deepEqual(hidden, []);
  assert.equal(lightboxShowsChrome({ kind: "widget", widget: { id: "q" } }, false), false);
  assert.equal(lightboxShowsChrome({ kind: "message" }, false), true);

  const bubbles = lightboxMessageBubbles(
    "from Snorlax: ![a](https://cdn.example/a.png)\n\nmore",
    "Snorlax",
    true,
  );
  assert.equal(bubbles.bubbles.length, 2);
  assert.match(bubbles.bubbles[0] ?? "", /!\[a\]/);
});

test("arrow keys and a horizontal swipe step, and a zoomed drag does not", () => {
  assert.equal(lightboxStepKey({ key: "ArrowLeft" }), "previous");
  assert.equal(lightboxStepKey({ key: "ArrowRight" }), "next");
  assert.equal(lightboxStepKey({ key: "ArrowLeft", shiftKey: true }), null);
  assert.equal(lightboxStepKey({ key: "ArrowRight", metaKey: true }), null);
  assert.equal(lightboxStepKey({ key: "ArrowLeft", ctrlKey: true }), null);
  assert.equal(lightboxStepKey({ key: "ArrowRight", altKey: true }), null);
  assert.equal(lightboxStepKey({ key: "+" }), null);

  assert.equal(lightboxSwipeSteps({ x: -81, y: 10 }, 1), "next");
  assert.equal(lightboxSwipeSteps({ x: 81, y: 10 }, 1), "previous");
  assert.equal(lightboxSwipeSteps({ x: -80, y: 0 }, 1), null);
  assert.equal(lightboxSwipeSteps({ x: -120, y: 120 }, 1), null);
  assert.equal(lightboxSwipeSteps({ x: 0, y: 200 }, 1), null);
  assert.equal(lightboxSwipeSteps({ x: -200, y: 0 }, 2), null);
  assert.equal(lightboxSwipeSteps({ x: Number.NaN, y: 0 }, 1), null);
});

test("Tab reaches Previous and Next and still ends on Close", () => {
  const zoom = lightboxZoomFocusOrder({
    saveOffered: true,
    canZoomOut: true,
    canZoomIn: true,
  });
  const mid = lightboxStepFocusOrder({
    zoomOrder: zoom,
    canPrevious: true,
    canNext: true,
  });
  assert.deepEqual(mid, ["previous", "next", "zoomOut", "zoomIn", "copy", "save", "close"]);
  assert.equal(nextLightboxFocus(mid, "close", false), "previous");
  assert.equal(nextLightboxFocus(mid, "previous", true), "close");
  const first = lightboxStepFocusOrder({
    zoomOrder: zoom,
    canPrevious: false,
    canNext: true,
  });
  assert.deepEqual(first, ["next", "zoomOut", "zoomIn", "copy", "save", "close"]);
  const only = lightboxStepFocusOrder({
    zoomOrder: zoom,
    canPrevious: false,
    canNext: false,
  });
  assert.deepEqual(only, zoom);
});

test("desktop steps without closing, sending, or adding a shortcut", () => {
  assert.match(app, /from "\.\/lightboxStep"/);
  assert.match(app, /className="image-lightbox-step"/);
  assert.match(app, /data-edge="previous"/);
  assert.match(app, /data-edge="next"/);
  assert.match(app, /LIGHTBOX_STEP_PREVIOUS_ARIA/);
  assert.match(app, /LIGHTBOX_STEP_NEXT_ARIA/);
  assert.match(app, /commitLightboxStepRef\.current\("previous"\)/);
  assert.match(app, /commitLightboxStepRef\.current\("next"\)/);
  assert.match(app, /lightboxStepKey\(/);
  assert.match(app, /const opening = !lightboxWasOpen\.current/);
  assert.match(app, /data-lightbox-id=\{image\.id\}/);
  assert.match(app, /data-lightbox-id=\{row\.id\}/);
  assert.match(images, /data-lightbox-id=\{id\}/);
  assert.match(images, /lightboxScopeFromWrap/);
  assert.match(readFileSync(join(here, "MarkdownBody.tsx"), "utf8"), /lightboxScopeFromWrap/);
  assert.doesNotMatch(shortcuts, /Previous image|ArrowLeft|lightbox step/i);

  const stepBtn = sliceFn(app, 'className="image-lightbox-step"', "LIGHTBOX_STEP_NEXT");
  assert.doesNotMatch(stepBtn, /closeImageLightbox|removePending|\.send\(/);
  const stepFn = sliceFn(app, "commitLightboxStepRef.current = ", "useEffect(() => {");
  assert.match(stepFn, /lightboxStepKeepsOpen\(\)/);
  assert.match(stepFn, /setLightboxZoom\(LIGHTBOX_ZOOM_FIT\)/);
  assert.doesNotMatch(stepFn, /closeImageLightbox|setLightboxPaint|removePending/);

  const rule = block(".image-lightbox-step");
  assert.match(rule, /font-size:\s*12px/);
  assert.doesNotMatch(rule, /transition|animation/);
  const count = block(".image-lightbox-count");
  assert.match(count, /font-size:\s*12px/);
  assert.doesNotMatch(count, /transition|animation/);
  assert.match(src, /No new HTTP/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
});

test("iOS previous, next, and swipe use the same limits", () => {
  assert.match(swift, /static let previousLabel = "Previous"/);
  assert.match(swift, /static let nextLabel = "Next"/);
  assert.match(swift, /static let previousAccessibility = "Previous image"/);
  assert.match(swift, /static let nextAccessibility = "Next image"/);
  assert.match(swift, /static let swipeDistance: CGFloat = 80/);
  assert.match(swift, /static func keepsOpen\(\) -> Bool \{ true \}/);
  assert.match(swift, /static func animates\(\) -> Bool \{ false \}/);
  assert.match(swift, /key == \.leftArrow/);
  assert.match(swift, /key == \.rightArrow/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(overlay, /LightboxStep\.previousLabel/);
  assert.match(overlay, /LightboxStep\.nextLabel/);
  assert.match(overlay, /LightboxStep\.previousAccessibility/);
  assert.match(overlay, /LightboxStep\.nextAccessibility/);
  assert.match(overlay, /LightboxStep\.swipeDirection/);
  assert.match(overlay, /LightboxStep\.keepsOpen\(\)/);
  assert.match(overlay, /ImageLightbox\.swipeDismisses/);
  assert.match(chat, /lightboxStepKey\(press\)/);
  assert.match(chat, /LightboxStep\.keyAction/);
  assert.match(chat, /stepLightbox/);
  assert.match(chat, /LightboxStep\.strip/);
  const stepFn = sliceFn(chat, "private func stepLightbox", "private func lightboxStepKey");
  assert.doesNotMatch(stepFn, /closeLightbox\(|removePending|model\.send\(/);
  assert.match(stepFn, /lightboxZoom = \.fit/);
});

test("OpenAPI stays 0.18.0 and v2.13 is documented", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /lightboxStep\.test\.ts/);
  assert.match(ci, /test_ios_lightbox_step\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v2\.13 /);
  assert.match(spec, /## 213\. v2\.13 — step between images in the lightbox/);
  assert.match(spec, /Checked v2\.12 on main at 59632ad/);
});
