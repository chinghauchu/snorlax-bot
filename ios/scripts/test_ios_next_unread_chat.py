#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.17 jump to the next unread chat from the keyboard.

Hardware command-shift-J or control-shift-J opens the next unread chat
after the one that is open, in the chat list's current visible order,
wrapping. Opening restores that chat's draft and reading place and
focuses the composer. If no chat in that order is unread, nothing
changes. The composer does not own the chord and does not insert the
letter. A key repeat does not jump again. IME and any other text field
do. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "NextUnreadChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "nextUnreadChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.17 jump to the next unread chat from the keyboard (Cmd/Ctrl-Shift-J opens "
    "the next unread chat after the currently open one in the sidebar's current "
    "visible order, the same order Alt+Up/Down and Cmd/Ctrl-1..9 use, with the "
    "Pinned group first, wrapping around; opening that chat restores its draft and "
    "reading place and focuses the composer the same way Alt+Up/Down does; if no "
    "chat in that order is unread, nothing changes; the open chat is not selected "
    "again when it is the only unread row; muted chats do not count because they do "
    "not paint the accent dot; archived chats are included only while that list is "
    "showing; the chord still works from the composer and does not insert text; a "
    "key repeat does not jump again and does not insert; IME composition keeps the "
    "key; find, the quick switcher, the shortcuts list, rename, the lightbox, a "
    "modal or overlay text field, and a focused widget, approve, or connect card "
    "keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, "
    "Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, "
    "Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, "
    "Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-/, Cmd/Ctrl-1..9, "
    "Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; "
    "the shortcuts list includes Cmd/Ctrl Shift J; iOS hardware command-shift-J opens "
    "that next unread chat and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "j":
        return True
    return characters.lower() == "j"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def target(ids, current_id, unread):
    rows = [row for row in ids if row]
    if not rows:
        return None
    start = rows.index(current_id) if current_id in rows else -1
    for step in range(1, len(rows) + 1):
        index = step - 1 if start < 0 else (start + step) % len(rows)
        row = rows[index]
        if current_id is not None and row == current_id:
            continue
        if row in unread:
            return row
    return None


def test_chord_and_target() -> None:
    assert is_chord("j", command=True, shift=True) is True
    assert is_chord("J", control=True, shift=True) is True
    assert is_chord("j", command=True, shift=True, characters="j") is True
    assert is_chord("j") is False
    assert is_chord("j", command=True) is False
    assert is_chord("j", command=True, shift=True, option=True) is False
    assert is_chord("j", command=True, control=True, shift=True) is False
    assert is_chord("h", command=True, shift=True) is False
    assert is_chord("f", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    unread = {"pin", "c"}
    assert target(["pin", "a", "b", "c"], "a", unread) == "c"
    assert target(["pin", "a", "b", "c"], "c", unread) == "pin"
    assert target(["a", "b", "c"], "a", {"a"}) is None
    assert target(["a", "b", "c"], None, {"b"}) == "b"
    assert target(["a", "b", "c"], "b", set()) is None
    assert target([], "a", {"a"}) is None
    assert 'static let keysLabel = "⌘⇧J"' in SWIFT
    assert 'static let action = "Next unread chat"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "static func target" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isNextUnreadChord" in DESKTOP
    assert "nextUnreadBlocked" in DESKTOP
    assert "nextUnreadShouldOpen" in DESKTOP
    assert "nextUnreadChatId" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "chatOpen" not in DESKTOP.split("export function nextUnreadBlocked")[1].split("export function")[0]


def test_existing_open_path() -> None:
    start = CHAT.index("func nextUnreadKey")
    end = CHAT.index("func nextUnreadFromComposer", start)
    key = CHAT[start:end]
    assert "NextUnreadChat.isChord" in key
    assert "hasRealAgent" not in key
    assert "composerFocused" in key
    assert "nextUnreadBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "openNextUnread()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("openNextUnread()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "openNextUnread()" in follow
    assert "openNextUnreadChat()" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    assert "func openNextUnreadChat" in MODEL
    assert "NextUnreadChat.target" in MODEL
    assert "jumpChatIds()" in MODEL
    assert "showsUnreadDot" in MODEL
    assert "wantsComposerFocus = true" in MODEL
    assert "await select(next, push: true)" in MODEL
    commands = COMPOSER[
        COMPOSER.index("func nextUnreadCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "j"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func nextUnreadFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "nextUnreadConsumed" in selector
    assert "onNextUnread?()" in selector
    assert selector.index("if nextUnreadConsumed") < selector.index("nextUnreadConsumed = true")
    assert selector.index("nextUnreadConsumed = true") < selector.index("onNextUnread?()")
    assert "keyboardJ" in COMPOSER
    assert "model.send(" not in commands
    assert "const onNextUnread" in APP
    assert "nextUnreadChatId(ids, activeId, unread)" in APP
    assert "selectAgentRef.current(next)" in APP
    assert 'addEventListener("keydown", onNextUnread, true)' in APP
    assert "nextUnreadShouldOpen" in APP
    assert "paintsUnreadAccent" in APP
    handler = APP[APP.index("const onNextUnread") : APP.index('addEventListener("keydown", onNextUnread, true)')]
    assert "chatOpen: active != null" not in handler
    assert handler.index("preventDefault") < handler.index("nextUnreadShouldOpen")
    assert handler.index("nextUnreadShouldOpen") < handler.index("selectAgentRef.current(next)")
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "NextUnreadChat.keysLabel" in SHEET
    assert "NextUnreadChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.17 " in ROADMAP
    assert "## 117. v1.17" in SPEC
    assert "python3 ios/scripts/test_ios_next_unread_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_target,
        test_existing_open_path,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
