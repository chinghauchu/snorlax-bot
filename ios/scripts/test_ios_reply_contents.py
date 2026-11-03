#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.44 contents outline on a long reply.

A finished assistant reply with three or more headings shows Contents
above the first bubble. Tap a row and that heading scrolls into view.
A heading inside a folded section opens that section first. A heading
inside a clamped bubble opens that bubble. Streaming stays plain text.
The control does not take focus. No new animation. No new shortcut.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ReplyContents.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LONG = (IOS / "LongMessage.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "replyContents.ts").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.44 contents outline on a long reply"


def test_rules() -> None:
    assert 'static let label = "Contents"' in SWIFT
    assert "static let minimum = 3" in SWIFT
    assert 'static let goToEmpty = "Go to heading"' in SWIFT
    assert "static let scrollAnchor = UnitPoint.center" in SWIFT
    assert "static func entries(" in SWIFT
    assert "static func ancestorsToOpen(" in SWIFT
    assert "static func bubbleIndex(" in SWIFT
    assert "return nil" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "not saved" in SWIFT
    assert "/v1/" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "CONTENTS_MIN_HEADINGS = 3" in DESKTOP
    assert 'CONTENTS_LABEL = "Contents"' in DESKTOP
    assert 'block: "center"' in DESKTOP
    assert 'behavior: "auto"' in DESKTOP
    assert "localStorage" not in DESKTOP


def test_chrome() -> None:
    assert "ReplyContentsList" in CHAT
    assert "ReplyContents.entries(" in CHAT
    assert "jumpToContents(" in CHAT
    assert "ReplyContents.ancestorsToOpen(" in CHAT
    assert "replyContentsScroll.scroll(" in CHAT
    assert "ReplyContents.scrollAnchor" in CHAT
    assert "contentsMessageId: message.id" in CHAT
    assert "contentsOpenToken" in CHAT
    assert "contentsOpenBubble = nil" in CHAT
    assert "focusable(false)" in SWIFT
    assert "ReplyContents.anchor(" in MARKDOWN
    assert ".id(contentsAnchor)" in MARKDOWN
    assert "contentsOpenToken" in LONG
    assert "disablesAnimations = true" in LONG
    assert "Go to heading" not in SHORTCUTS
    assert "Contents" not in SHORTCUTS
    assert "UserDefaults" not in CHAT


def test_docs() -> None:
    for text in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in text
        assert "version: 0.19" not in text
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 244. v2.44" in SPEC
    assert "test_ios_reply_contents.py" in CI
    assert not PANE.exists()


if __name__ == "__main__":
    test_rules()
    test_chrome()
    test_docs()
    print("ok")
