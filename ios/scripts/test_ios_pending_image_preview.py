#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.10 preview a pending image before sending.

A pending image chip was only a 56pt thumb with a remove control.
Tapping it now opens that local preview in the existing lightbox.
Close, a tap outside, Esc, or a swipe down dismisses it and leaves
the chip. Nothing is sent or removed. Videos stay the player. File
chips stay chips. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "PendingImagePreview.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LIGHTBOX = (IOS / "ImageLightbox.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "pendingImagePreview.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.10 preview a pending image before sending"


def slice_between(source: str, start: str, end: str) -> str:
    at = source.index(start)
    stop = source.index(end, at + len(start))
    return source[at:stop]


def test_rules_match() -> None:
    assert 'kind == .image' in SWIFT
    assert 'return "Preview image"' in SWIFT
    assert 'return "Preview \\(trimmed)"' in SWIFT
    assert "static func previewData" in SWIFT
    assert "!data.isEmpty" in SWIFT
    assert "pendingImageOpensPreview" in DESKTOP
    assert 'kind === "image"' in DESKTOP
    assert 'return trimmed ? `Preview ${trimmed}` : "Preview image"' in DESKTOP
    assert "lightboxLabel(row.name)" in DESKTOP
    assert "fetch(" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "static let close = \"Close\"" in LIGHTBOX
    assert "translation.height > 80" in LIGHTBOX


def test_chat_wiring() -> None:
    chip = slice_between(CHAT, "private func pendingChip", "private struct FlowWrap")
    image = slice_between(chip, "row.kind == .image", "row.kind == .video")
    assert "PendingImagePreview.previewData" in image
    assert "onPreviewPendingImage(" in image
    assert "local: bytes" in image
    assert "onPreviewPendingImage: { openLightbox($0) }" in CHAT
    assert "PendingImagePreview.accessibilityLabel(name: row.name)" in image
    assert "model.removePending(id: row.id)" in image
    assert 'accessibilityLabel("Remove \\(row.name)")' in image
    assert "model.send(" not in image
    video = slice_between(chip, "row.kind == .video", "ChatAttachment.formatSize")
    assert "PendingImagePreview" not in video
    assert "openLightbox" not in video
    assert "model.removePending(id: row.id)" in video
    files = chip[chip.index("ChatAttachment.formatSize") :]
    assert "PendingImagePreview" not in files
    assert "openLightbox" not in files
    assert "className=\"pending-preview\"" in APP
    assert "pendingImagePreviewTarget(row)" in APP
    assert "openImageLightbox(target, event.currentTarget)" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.10 " in ROADMAP
    assert "## 210. v2.10" in SPEC
    assert "Checked v0.79 on main at 8cb29dd" in SPEC
    assert "test_ios_pending_image_preview.py" in CI
    assert "pendingImagePreview.test.ts" in PKG
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in CHAT


def main() -> int:
    test_rules_match()
    test_chat_wiring()
    test_docs_and_openapi()
    print("ios pending image preview ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
