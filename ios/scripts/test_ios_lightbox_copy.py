#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.18 copy the image from the lightbox.

Save already downloads or shares the picture the lightbox is showing.
Nothing put that picture on the clipboard. Copy now sits with Save.
Desktop writes the bytes. iOS puts the same picture on the pasteboard
and does not ask for photo-library permission. Copied lasts 1.2s.
The overlay stays open. Nothing is sent and a pending chip is not
removed. No new animation. No new shortcut. No new HTTP. OpenAPI
stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "LightboxCopy.swift").read_text(encoding="utf-8")
OVERLAY = (IOS / "ImageLightbox.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "lightboxCopy.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.18 copy the image from the lightbox"


def slice_between(source: str, start: str, end: str) -> str:
    at = source.index(start)
    stop = source.index(end, at + len(start))
    return source[at:stop]


def test_rules() -> None:
    assert 'static let label = "Copy"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let accessibilityLabel = "Copy image"' in SWIFT
    assert "static let feedbackMs: UInt64 = 1200" in SWIFT
    assert "static func keepsOpen() -> Bool { true }" in SWIFT
    assert "return false" in SWIFT
    assert "UIPasteboard.general.image = image" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "requestAuthorization" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert 'LIGHTBOX_COPY_LABEL = "Copy"' in DESKTOP
    assert 'LIGHTBOX_COPY_ARIA = "Copy image"' in DESKTOP
    assert "LIGHTBOX_COPY_MS = 1200" in DESKTOP
    assert "lightboxCopyKeepsOpen" in DESKTOP
    assert "image/png" in DESKTOP
    assert "image/svg+xml" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP
    assert "Copy image" not in SHORTCUTS


def test_overlay_copy_keeps_the_image_open() -> None:
    assert "Button(copied ? LightboxCopy.copiedLabel : LightboxCopy.label)" in OVERLAY
    assert "LightboxCopy.accessibilityLabel" in OVERLAY
    assert "LightboxCopy.keepsOpen()" in OVERLAY
    assert "LightboxCopy.writeToPasteboard(imageData)" in OVERLAY
    assert "LightboxCopy.feedbackNanoseconds" in OVERLAY
    assert "Button(LightboxSave.label)" in OVERLAY
    assert "static let close = \"Close\"" in OVERLAY
    assert "PHPhotoLibrary" not in OVERLAY
    assert "/v1/" not in OVERLAY
    copy = slice_between(OVERLAY, "private func copyImage()", "private func saveImage()")
    assert "onClose()" not in copy
    assert "removePending" not in copy
    assert "model.send(" not in copy
    assert 'className="image-lightbox-copy"' in APP
    assert "copyLightboxImage()" in APP
    desktop = slice_between(
        APP,
        "async function copyLightboxImage()",
        "async function saveLightboxImage()",
    )
    assert "closeImageLightbox" not in desktop
    assert "removePending" not in desktop
    assert ".send(" not in desktop
    assert "navigator.clipboard.write" in desktop


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 218. v2.18" in SPEC
    assert "test_ios_lightbox_copy.py" in CI
    assert "lightboxCopy.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT


def main() -> int:
    test_rules()
    test_overlay_copy_keeps_the_image_open()
    test_docs_and_openapi()
    print("ios lightbox copy ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
