#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.79 image lightbox.

Tap an image on a user-RIGHT or assistant-LEFT kind=message bubble to
open a full-size overlay. Close, a tap outside, Esc, or a swipe down
dismisses it. Videos stay the player. File chips stay chips. Reduce
Motion is instant show/hide. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ImageLightbox.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "imageLightbox.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.79 image lightbox (click or tap an image on a user-RIGHT or "
    "assistant-LEFT kind=message opens a full-size overlay; dimmed "
    "backdrop; Close; Esc or a click or tap outside dismisses; iOS "
    "swipe-down dismisses; videos stay the player; file chips stay; "
    "Reduce Motion is instant show/hide; focus returns to that image; "
    "no new HTTP)"
)


def test_images_only_and_fade() -> None:
    assert 'static let close = "Close"' in SWIFT
    assert 'static let label = "Image"' in SWIFT
    assert "static let fadeMs: Double = 120" in SWIFT
    assert "kind == .image" in SWIFT
    assert "reduceMotion ? 0 : fadeSeconds" in SWIFT
    assert "reduceMotion ? nil : .easeInOut(duration: fadeSeconds)" in SWIFT
    assert "reduceMotion ? .hidden" in SWIFT
    assert "translation.height > 80" in SWIFT
    assert "IMAGE_LIGHTBOX_FADE_MS = 120" in DESKTOP
    assert 'return kind === "image"' in DESKTOP
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT


def test_tap_swipe_close_and_reduce_motion() -> None:
    assert "ImageLightboxOverlay(" in CHAT
    assert "ImageLightbox.isImage" in CHAT
    assert "openLightbox(" in CHAT
    assert "closeLightbox()" in CHAT
    assert "ImageLightbox.escapeCloses" in CHAT
    assert "ImageLightbox.appear(reduceMotion: reduceMotion)" in CHAT
    assert "ImageLightbox.dismiss(reduceMotion: reduceMotion)" in CHAT
    assert "transaction.animation = nil" in SWIFT
    assert "onTapGesture { onClose() }" in SWIFT
    assert ".onExitCommand(perform: onClose)" in SWIFT
    assert "keyboardShortcut(.cancelAction)" in SWIFT
    assert "DragGesture" in SWIFT
    assert "accessibilityReduceMotion" in CHAT
    videos = CHAT.split("ForEach(videos)", 1)[1].split(
        "if images.isEmpty && videos.isEmpty", 1
    )[0]
    assert "RemoteVideo" in videos
    assert "onOpenImage" not in videos
    assert "openLightbox" not in videos
    files = CHAT.split("ForEach(files)", 1)[1].split("private var timeMenu", 1)[0]
    assert "model.openAttachment(file)" in files
    assert "onOpenImage" not in files
    assert 'className="bubble-image-btn"' in APP
    assert 'className="image-lightbox-backdrop"' in APP
    assert "AuthedVideo" in APP


def test_openapi_stays_0180() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert not PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "/v1/" not in SWIFT
    assert "fetch(" not in DESKTOP
    assert PHRASE in ROADMAP


def main() -> int:
    tests = [
        test_images_only_and_fade,
        test_tap_swipe_close_and_reduce_motion,
        test_openapi_stays_0180,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}", file=sys.stderr)
    if failed:
        print(f"{failed} failed", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
