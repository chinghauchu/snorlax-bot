#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.11 save the image from the lightbox.

The lightbox could show a sent image, a markdown image, or a pending
preview, and the only control was Close. Save now sits beside Close.
Desktop downloads the bytes already shown. iOS hands those bytes to
the system share sheet and does not ask for photo-library permission.
The overlay stays open. Nothing is sent and a pending chip is not
removed. Videos and file chips still do not open the lightbox. No new
animation. No new shortcut. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "LightboxSave.swift").read_text(encoding="utf-8")
OVERLAY = (IOS / "ImageLightbox.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "lightboxSave.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.11 save the image from the lightbox"


def slice_between(source: str, start: str, end: str) -> str:
    at = source.index(start)
    stop = source.index(end, at + len(start))
    return source[at:stop]


def test_rules_match() -> None:
    assert 'static let label = "Save"' in SWIFT
    assert 'static let accessibilityLabel = "Save image"' in SWIFT
    assert "static func keepsOpen() -> Bool { true }" in SWIFT
    assert "return false" in SWIFT
    assert "0x89, 0x50, 0x4E, 0x47" in SWIFT
    assert "0xFF, 0xD8, 0xFF" in SWIFT
    assert "0x47, 0x49, 0x46" in SWIFT
    assert "0x52, 0x49, 0x46, 0x46" in SWIFT
    assert "0x42, 0x4D" in SWIFT
    assert 'fallbackStem = "Image"' in SWIFT
    assert 'fallbackExtension = "png"' in SWIFT
    assert "photo-library permission" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "requestAuthorization" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "LIGHTBOX_SAVE_LABEL = \"Save\"" in DESKTOP
    assert "LIGHTBOX_SAVE_ARIA = \"Save image\"" in DESKTOP
    assert "lightboxSaveKeepsOpen" in DESKTOP
    assert "sniffImageExtension" in DESKTOP
    assert "0x89" in DESKTOP
    assert "0xff" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP


def test_overlay_save_keeps_the_image_open() -> None:
    assert "Button(LightboxSave.label)" in OVERLAY
    assert "LightboxSave.accessibilityLabel" in OVERLAY
    assert "LightboxSave.keepsOpen()" in OVERLAY
    assert "LightboxSave.filename(" in OVERLAY
    assert "LightboxSave.sniffExtension(imageData)" in OVERLAY
    assert "UIActivityViewController" in OVERLAY
    assert "static let close = \"Close\"" in OVERLAY
    assert "onTapGesture { onClose() }" in OVERLAY
    assert "translation.height > 80" in OVERLAY
    assert "PHPhotoLibrary" not in OVERLAY
    assert "requestAuthorization" not in OVERLAY
    assert "/v1/" not in OVERLAY
    save = slice_between(OVERLAY, "private func saveImage()", "private func load()")
    assert "onClose()" not in save
    assert "removePending" not in save
    assert "model.send(" not in save
    assert "ImageLightboxOverlay(" in CHAT
    videos = CHAT.split("ForEach(videos)", 1)[1].split(
        "if images.isEmpty && videos.isEmpty", 1
    )[0]
    assert "RemoteVideo" in videos
    assert "openLightbox" not in videos
    assert 'className="image-lightbox-save"' in APP
    assert "saveLightboxImage()" in APP
    save_desktop = slice_between(
        APP, "async function saveLightboxImage()", "useEffect(() => {"
    )
    assert "closeImageLightbox" not in save_desktop
    assert "removePending" not in save_desktop
    assert ".send(" not in save_desktop


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.11 " in ROADMAP
    assert "## 211. v2.11" in SPEC
    assert "Checked v0.79 and v2.10 on main at 80177eb" in SPEC
    assert "test_ios_lightbox_save.py" in CI
    assert "lightboxSave.test.ts" in PKG
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in CHAT


def main() -> int:
    test_rules_match()
    test_overlay_save_keeps_the_image_open()
    test_docs_and_openapi()
    print("ios lightbox save ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
