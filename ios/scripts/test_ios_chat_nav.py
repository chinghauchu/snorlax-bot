#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.92 keyboard previous/next chat.

Option+Up / Option+Down opens the previous or next chat in the
sidebar's visible order. Pinned chats stay first. All / Unread
applies. No wrap. IME and in-chat find do not navigate. Plain Up
still recalls. Opening the chat is the row-open path. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ChatNav.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatNav.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.92 keyboard previous/next chat (Alt+Up / Alt+Down, Option on macOS, "
    "opens the previous or next chat in the sidebar's current visible order; "
    "the Pinned group stays first and the All / Unread filter applies; no wrap "
    "at the ends; IME composition does not navigate; plain Up-arrow still "
    "recalls the last message and in-chat find keeps its own previous and "
    "next; opening the chat clears unread, restores that chat's draft and "
    "reading place, and focuses the composer; the keyboard shortcuts list "
    "includes it; iOS hardware Option+Up / Option+Down in the chat view does "
    "the same; no new HTTP)"
)


def direction(key: str, option: bool, command=False, control=False, shift=False, composing=False, find_open=False):
    if composing or find_open:
        return None
    if not option or command or control or shift:
        return None
    if key == "up":
        return -1
    if key == "down":
        return 1
    return None


def adjacent(ids: list[str], current: str | None, step: int) -> str | None:
    if step not in (-1, 1) or not current:
        return None
    if current not in ids:
        return None
    index = ids.index(current)
    nxt = index + step
    if nxt < 0 or nxt >= len(ids):
        return None
    chosen = ids[nxt]
    if not chosen or chosen == current:
        return None
    return chosen


def visible_order(rows: list[tuple[str, bool]], unread_only: bool, pins: list[str]) -> list[str]:
    shown = [row for row in rows if (row[1] if unread_only else True)]
    by_id = {row[0]: row for row in shown}
    pinned = []
    taken = set()
    for pin in pins:
        row = by_id.get(pin)
        if row is None or pin in taken:
            continue
        pinned.append(pin)
        taken.add(pin)
    rest = [row[0] for row in shown if row[0] not in taken]
    return pinned + rest


def test_order_and_chord() -> None:
    rows = [("a", False), ("b", True), ("c", True), ("d", False)]
    all_ids = visible_order(rows, False, ["c", "a"])
    assert all_ids == ["c", "a", "b", "d"]
    assert adjacent(all_ids, "c", -1) is None
    assert adjacent(all_ids, "c", 1) == "a"
    assert adjacent(all_ids, "d", 1) is None
    assert adjacent(all_ids, "missing", 1) is None
    unread = visible_order(rows, True, ["c", "a"])
    assert unread == ["c", "b"]
    assert adjacent(unread, "a", 1) is None
    assert adjacent(unread, "c", 1) == "b"
    assert adjacent(unread, "b", 1) is None
    assert direction("up", True) == -1
    assert direction("down", True) == 1
    assert direction("up", False) is None
    assert direction("up", True, shift=True) is None
    assert direction("up", True, command=True) is None
    assert direction("down", True, composing=True) is None
    assert direction("down", True, find_open=True) is None
    assert direction("left", True) is None
    assert 'static let keysLabel = "Option ↑ / Option ↓"' in SWIFT
    assert 'static let action = "Previous or next chat"' in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_chat_wires_the_row_open_path() -> None:
    assert "func visibleChatOrder()" in MODEL
    assert "func openAdjacentChat(direction: Int)" in MODEL
    assert "ChatListFilter.includes" in MODEL
    assert "ChatPins.grouped" in MODEL
    assert "await select(next, push: true)" in MODEL
    assert "wantsComposerFocus = true" in MODEL
    assert "func select(_ id: String, push: Bool)" in MODEL
    assert "computerPane.ts" not in MODEL
    assert "onChatNav:" in CHAT
    assert "model.openAdjacentChat(direction: direction)" in CHAT
    assert "ChatNav.direction" in CHAT
    assert "findOpen" in CHAT
    assert ".onKeyPress(phases: .down)" in CHAT
    assert "modifierFlags: .alternate" in COMPOSER
    assert "UIKeyCommand.inputUpArrow" in COMPOSER
    assert "UIKeyCommand.inputDownArrow" in COMPOSER
    assert "markedTextRange != nil" in COMPOSER
    assert "onChatNav?(direction)" in COMPOSER
    assert "func recallFromArrowUp" in COMPOSER
    assert "text.isEmpty && markedTextRange == nil" in COMPOSER
    assert "ChatNav.keysLabel" in SHEET
    assert "ChatNav.action" in SHEET
    assert "Recall last message" in SHEET
    assert "computerPane.ts" not in CHAT
    assert "const onChatNav" in APP
    assert "chatNavDirection(" in APP
    assert "adjacentChatId(ids, activeId, direction)" in APP
    assert "selectAgentRef.current(next)" in APP
    assert "isComposerComposing(event)" in APP
    assert "[...pinnedAgents, ...restAgents]" in APP
    assert 'addEventListener("keydown", onChatNav, true)' in APP
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.92 " in ROADMAP
    assert "## 93. v0.92" in SPEC
    assert "python3 ios/scripts/test_ios_chat_nav.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_order_and_chord,
        test_chat_wires_the_row_open_path,
        test_openapi_roadmap,
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
    raise SystemExit(main())
