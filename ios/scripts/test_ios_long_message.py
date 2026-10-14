#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.81 collapse long LEFT messages.

A completed assistant LEFT kind=message bubble taller than about 14
lines shows the first chunk and a muted 12pt Show more. Tap expands
that bubble and the control becomes Show less. Mid-stream stays open.
A Stop partial collapses once it is completed. Each bubble collapses
on its own. Reduce Motion is instant. The control does not take
composer focus. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "LongMessage.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "longMessage.ts").read_text(encoding="utf-8")
VIEW = (ROOT / "desktop" / "src" / "LongMessageBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.81 collapse long LEFT (a completed assistant LEFT kind=message "
    "bubble taller than about 14 lines shows the first chunk and a muted "
    "12px/12pt Show more; click or tap expands the body and the control "
    "becomes Show less; mid-stream stays open; a Stop partial collapses "
    "once it is completed; each bubble in a turn collapses on its own; "
    "Reduce Motion is instant; the control does not move composer focus; "
    "an active find match in that bubble stays fully visible; no new HTTP)"
)


def test_threshold_and_labels() -> None:
    assert 'static let showMore = "Show more"' in SWIFT
    assert 'static let showLess = "Show less"' in SWIFT
    assert "static let lines: CGFloat = 14" in SWIFT
    assert "static let expandSeconds: Double = 0.16" in SWIFT
    assert "UIFont.systemFont(ofSize: 14).lineHeight * lines" in SWIFT
    assert "completed && overflows && !expanded && !activeFind" in SWIFT
    assert "completed && overflows && !activeFind" in SWIFT
    assert "expanded ? showLess : showMore" in SWIFT
    assert "reduceMotion ? nil" in SWIFT
    assert "LONG_MESSAGE_LINES = 14" in DESKTOP
    assert 'SHOW_MORE_LABEL = "Show more"' in DESKTOP
    assert 'SHOW_LESS_LABEL = "Show less"' in DESKTOP
    assert "LONG_MESSAGE_EXPAND_MS = 160" in DESKTOP
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT


def test_per_bubble_and_focus() -> None:
    assert "LongMessageBody(" in CHAT
    assert "completed: completed" in CHAT
    assert "activeFind:" in CHAT
    assert 'find.activeRowId == "\\(message.id)#\\(offset)"' in CHAT
    assert ".focusable(false)" in SWIFT
    assert "transaction.animation = nil" in SWIFT
    assert ".font(.system(size: 12, weight: .medium))" in SWIFT
    assert "foregroundStyle(.secondary)" in SWIFT
    user = CHAT.split("} else if isUser {", 1)[1].split("} else {", 1)[0]
    assert "LongMessageBody" not in user
    left = CHAT.split("LongMessageBody(", 1)[1].split("if showCopy || showSpeak", 1)[0]
    assert "MidStreamPlaintextView" in left
    assert "StreamingCaretView()" in left
    assert "AssistantMarkdown(" in left
    assert 'className="long-message-toggle"' in VIEW
    assert "onMouseDown={keepComposerFocus}" in VIEW
    assert "event.preventDefault()" in VIEW
    assert "focusComposer" not in VIEW
    assert ".focus(" not in VIEW
    assert "<LongMessageBody" in APP


def test_openapi_and_roadmap() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert not PANE.exists()
    assert PHRASE in ROADMAP
    assert "v0.81" in ROADMAP


if __name__ == "__main__":
    test_threshold_and_labels()
    test_per_bubble_and_focus()
    test_openapi_and_roadmap()
    print("ok")
