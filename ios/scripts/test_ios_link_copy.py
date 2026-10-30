#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.25 copy a link.

A completed assistant link on desktop offers a muted Copy link
control on hover or keyboard focus. Click copies the destination
URL, not the visible label, and does not open the link. The label
reads Copied for 1.5s. Streaming and user bubbles hide it. iOS
long-press Copy Link still copies that destination, then shows a
muted Copied for 1.5s. No new animation. No new shortcut. No new
HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "LinkCopy.swift").read_text(encoding="utf-8")
PREVIEW = (IOS / "LinkPreview.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "linkCopy.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.25 copy a link"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_clipboard_and_confirmation() -> None:
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert "static func clipboardText(_ destination: String) -> String" in SWIFT
    assert "static func noteCopied()" in SWIFT
    assert 'Notification.Name("snorlax.linkCopied")' in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "return nil" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'LINK_COPY_LABEL = "Copy link"' in DESKTOP
    assert 'LINK_COPY_ARIA = "Copy link"' in DESKTOP
    assert "export function linkCopyClipboardText" in DESKTOP
    assert "export function showLinkCopy" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert 'static let copyLink = "Copy Link"' in PREVIEW
    assert "UIPasteboard.general.string = copyText(url)" in PREVIEW
    assert "LinkCopy.clipboardText(destination(url))" in PREVIEW
    assert "LinkCopy.noteCopied()" in PREVIEW


def test_desktop_control_and_ios_confirm() -> None:
    link = _slice(BODY, "export function MdLink", "function FootnoteMarkers")
    assert "useContext(InsideMdLinkContext)" in link
    assert "nested || !showLinkCopy({ completed: assistantCopy, revealed: reveal })" in link
    assert 'className="md-link-wrap"' in link
    assert "openOsBrowser(url)" in link
    button = _slice(BODY, "function LinkCopyButton", "function FootnoteMarkers")
    assert "linkCopyClipboardText(destination)" in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    assert "openOsBrowser" not in button
    assert "<AssistantLinkCopyContext.Provider value={completed}>" in BODY
    confirm = _slice(CHAT, "if linkCopied {", "private func applyJumpChipPaint")
    assert "Text(LinkCopy.copiedLabel)" in confirm
    assert "LinkCopy.copiedAria" in confirm
    assert "LinkCopy.animation(reduceMotion: reduceMotion)" in confirm
    assert "LinkCopy.feedbackNanoseconds" in CHAT
    assert "LinkCopy.copiedNotification" in CHAT
    assert "noteLinkCopied()" in CHAT
    assert "Button(LinkCopy.copiedLabel)" not in confirm
    assert "Copy link" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 225. v2.25" in SPEC
    assert "test_ios_link_copy.py" in CI
    assert "linkCopy.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_clipboard_and_confirmation()
    test_desktop_control_and_ios_confirm()
    test_docs_and_openapi()
    print("ios link copy ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
