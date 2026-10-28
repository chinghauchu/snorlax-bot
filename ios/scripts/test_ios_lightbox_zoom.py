#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.12 zoom an image in the lightbox.

The lightbox fit the picture to the window. Save and Close were the
only controls, so a screenshot or a photo you were about to send
could not be enlarged. Zoom in and Zoom out now sit with Save.
Double-tap toggles 1× and 2×. Pinch zooms. A zoomed picture can be
dragged. Swipe-down dismisses only at 1×. + / =, −, and 0 do the
same while the overlay is open and are not a shortcuts-list chord.
Nothing is sent and a pending chip is not removed. Save still writes
the original bytes. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "LightboxZoom.swift").read_text(encoding="utf-8")
OVERLAY = (IOS / "ImageLightbox.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "lightboxZoom.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.12 zoom an image in the lightbox"


def slice_between(source: str, start: str, end: str) -> str:
    at = source.index(start)
    stop = source.index(end, at + len(start))
    return source[at:stop]


def test_rules_match() -> None:
    assert 'static let zoomInLabel = "Zoom in"' in SWIFT
    assert 'static let zoomOutLabel = "Zoom out"' in SWIFT
    assert 'static let zoomInAccessibility = "Zoom in"' in SWIFT
    assert 'static let zoomOutAccessibility = "Zoom out"' in SWIFT
    assert "static let minScale: Double = 1" in SWIFT
    assert "static let maxScale: Double = 4" in SWIFT
    assert "static let step: Double = 0.5" in SWIFT
    assert "static let doubleScale: Double = 2" in SWIFT
    assert "static let wheelNotch: Double = 48" in SWIFT
    assert "static func keepsOpen() -> Bool { true }" in SWIFT
    assert "Double-tap to zoom" in SWIFT
    assert "Double-tap to fit" in SWIFT
    assert "return false" in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert 'LIGHTBOX_ZOOM_IN_LABEL = "Zoom in"' in DESKTOP
    assert 'LIGHTBOX_ZOOM_OUT_LABEL = "Zoom out"' in DESKTOP
    assert "LIGHTBOX_ZOOM_MIN = 1" in DESKTOP
    assert "LIGHTBOX_ZOOM_MAX = 4" in DESKTOP
    assert "LIGHTBOX_ZOOM_STEP = 0.5" in DESKTOP
    assert "LIGHTBOX_WHEEL_NOTCH = 48" in DESKTOP
    assert "lightboxZoomKeepsOpen" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP


def test_overlay_zooms_without_closing() -> None:
    assert "Button(LightboxZoom.zoomOutLabel)" in OVERLAY
    assert "Button(LightboxZoom.zoomInLabel)" in OVERLAY
    assert "LightboxZoom.zoomOutAccessibility" in OVERLAY
    assert "LightboxZoom.zoomInAccessibility" in OVERLAY
    assert "LightboxZoom.keepsOpen()" in OVERLAY
    assert "LightboxZoom.canZoomOut" in OVERLAY
    assert "LightboxZoom.canZoomIn" in OVERLAY
    assert "MagnificationGesture()" in OVERLAY
    assert "TapGesture(count: 2)" in OVERLAY
    assert "allowsSwipeDismiss(scale: zoom.scale)" in OVERLAY
    assert "translation.height > 80" in OVERLAY
    assert "onTapGesture { onClose() }" in OVERLAY
    assert "scaleEffect(zoom.scale)" in OVERLAY
    assert "Button(LightboxSave.label)" in OVERLAY
    assert "/v1/" not in OVERLAY
    apply = slice_between(OVERLAY, "private func applyZoom", "private func picture")
    assert "onClose()" not in apply
    assert "removePending" not in apply
    assert "model.send(" not in apply
    assert "ImageLightboxOverlay(" in CHAT
    assert "lightboxZoomKey(press)" in CHAT
    assert "LightboxZoom.keyAction" in CHAT
    assert "lightboxZoom = .fit" in CHAT
    videos = CHAT.split("ForEach(videos)", 1)[1].split(
        "if images.isEmpty && videos.isEmpty", 1
    )[0]
    assert "RemoteVideo" in videos
    assert "openLightbox" not in videos
    assert 'className="image-lightbox-zoom"' in APP
    assert "lightboxZoomWheeled(" in APP
    assert "passive: false" in APP
    assert "commitLightboxZoomRef.current(\"toggle\")" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.12 " in ROADMAP
    assert "## 212. v2.12" in SPEC
    assert "Checked v0.79, v2.10, and v2.11 on main at bdfa32a" in SPEC
    assert "test_ios_lightbox_zoom.py" in CI
    assert "lightboxZoom.test.ts" in PKG
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in CHAT


def main() -> int:
    test_rules_match()
    test_overlay_zooms_without_closing()
    test_docs_and_openapi()
    print("ios lightbox zoom ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
