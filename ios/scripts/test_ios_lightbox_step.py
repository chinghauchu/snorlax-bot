#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.13 step between images in the lightbox.

The lightbox opened one picture. Previous and Next, the arrow
keys, and a horizontal swipe now walk the other pictures in the
open chat. One picture hides the controls. The ends do nothing.
Stepping resets to fit and does not close, send, or remove a
chip. Videos and file chips stay out. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "LightboxStep.swift").read_text(encoding="utf-8")
OVERLAY = (IOS / "ImageLightbox.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "lightboxStep.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.13 step between images in the lightbox"


def slice_between(source: str, start: str, end: str) -> str:
    at = source.index(start)
    stop = source.index(end, at + len(start))
    return source[at:stop]


def test_rules_match() -> None:
    assert 'static let previousLabel = "Previous"' in SWIFT
    assert 'static let nextLabel = "Next"' in SWIFT
    assert 'static let previousAccessibility = "Previous image"' in SWIFT
    assert 'static let nextAccessibility = "Next image"' in SWIFT
    assert "static let swipeDistance: CGFloat = 80" in SWIFT
    assert "static func keepsOpen() -> Bool { true }" in SWIFT
    assert "static func animates() -> Bool { false }" in SWIFT
    assert "key == .leftArrow" in SWIFT
    assert "key == .rightArrow" in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert 'LIGHTBOX_STEP_PREVIOUS = "Previous"' in DESKTOP
    assert 'LIGHTBOX_STEP_NEXT = "Next"' in DESKTOP
    assert 'LIGHTBOX_STEP_PREVIOUS_ARIA = "Previous image"' in DESKTOP
    assert "LIGHTBOX_STEP_SWIPE = 80" in DESKTOP
    assert "lightboxStepKeepsOpen" in DESKTOP
    assert "lightboxStepAnimates" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP


def test_overlay_steps_without_closing() -> None:
    assert "Button(LightboxStep.previousLabel)" not in OVERLAY or "LightboxStep.previousLabel" in OVERLAY
    assert "LightboxStep.previousLabel" in OVERLAY
    assert "LightboxStep.nextLabel" in OVERLAY
    assert "LightboxStep.previousAccessibility" in OVERLAY
    assert "LightboxStep.nextAccessibility" in OVERLAY
    assert "LightboxStep.swipeDirection" in OVERLAY
    assert "LightboxStep.keepsOpen()" in OVERLAY
    assert "ImageLightbox.swipeDismisses" in OVERLAY
    assert "onTapGesture { onClose() }" in OVERLAY
    assert "Button(LightboxSave.label)" in OVERLAY
    assert "/v1/" not in OVERLAY
    step = slice_between(CHAT, "private func stepLightbox", "private func lightboxStepKey")
    assert "closeLightbox()" not in step
    assert "removePending" not in step
    assert "model.send(" not in step
    assert "lightboxZoom = .fit" in step
    assert "ImageLightboxOverlay(" in CHAT
    assert "lightboxStepKey(press)" in CHAT
    assert "LightboxStep.keyAction" in CHAT
    assert "LightboxStep.strip" in CHAT
    videos = CHAT.split("ForEach(videos)", 1)[1].split(
        "if images.isEmpty && videos.isEmpty", 1
    )[0]
    assert "RemoteVideo" in videos
    assert "openLightbox" not in videos
    assert 'className="image-lightbox-step"' in APP
    assert "lightboxStepKey(" in APP
    assert "commitLightboxStepRef.current(\"previous\")" in APP
    assert "commitLightboxStepRef.current(\"next\")" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.13 " in ROADMAP
    assert "## 213. v2.13" in SPEC
    assert "Checked v2.12 on main at 59632ad" in SPEC
    assert "test_ios_lightbox_step.py" in CI
    assert "lightboxStep.test.ts" in PKG
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT


def main() -> int:
    test_rules_match()
    test_overlay_steps_without_closing()
    test_docs_and_openapi()
    print("ios lightbox step ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
