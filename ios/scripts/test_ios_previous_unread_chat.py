#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.21 jump to the previous unread chat from the keyboard.

Hardware command-shift-K or control-shift-K opens the previous unread
chat before the one that is open, in the chat list's current visible
order, wrapping. Opening restores that chat's draft and reading place
and focuses the composer. If no chat in that order is unread, nothing
changes. The composer does not own the chord and does not insert the
letter. A key repeat does not jump again. IME and any other text field
do. Command-K without Shift stays the quick switcher on desktop and is
not this chord. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "PreviousUnreadChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "previousUnreadChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.21 jump to the previous unread chat from the keyboard (Cmd/Ctrl-Shift-K opens "
    "the previous unread chat before the currently open one in the sidebar's current "
    "visible order, the same order Alt+Up/Down and Cmd/Ctrl-1..9 use, with the "
    "Pinned group first, wrapping around; opening that chat restores its draft and "
    "reading place and focuses the composer the same way Alt+Up/Down does; if no "
    "chat in that order is unread, nothing changes; the open chat is not selected "
    "again when it is the only unread row; muted chats do not count because they do "
    "not paint the accent dot; archived chats are included only while that list is "
    "showing; the chord still works from the composer and does not insert text; a "
    "key repeat does not jump again and does not insert; IME composition keeps the "
    "key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a "
    "modal or overlay text field, and a focused widget, approve, or connect card "
    "keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, "
    "Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, "
    "Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, "
    "Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, "
    "Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-/, Cmd/Ctrl-1..9, "
    "Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; "
    "the shortcuts list includes Cmd/Ctrl Shift K; iOS hardware command-shift-K opens "
    "that previous unread chat and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "k":
        return True
    return characters.lower() == "k"


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
        index = len(rows) - step if start < 0 else (start - step + len(rows)) % len(rows)
        row = rows[index]
        if current_id is not None and row == current_id:
            continue
        if row in unread:
            return row
    return None


def test_chord_and_target() -> None:
    assert is_chord("k", command=True, shift=True) is True
    assert is_chord("K", control=True, shift=True) is True
    assert is_chord("k", command=True, shift=True, characters="k") is True
    assert is_chord("k") is False
    assert is_chord("k", command=True) is False
    assert is_chord("k", command=True, shift=True, option=True) is False
    assert is_chord("k", command=True, control=True, shift=True) is False
    assert is_chord("j", command=True, shift=True) is False
    assert is_chord("o", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    unread = {"pin", "c"}
    assert target(["pin", "a", "b", "c"], "a", unread) == "pin"
    assert target(["pin", "a", "b", "c"], "pin", unread) == "c"
    assert target(["a", "b", "c"], "a", {"a"}) is None
    assert target(["a", "b", "c"], None, {"c", "a"}) == "c"
    assert target(["a", "b", "c"], "b", set()) is None
    assert target([], "a", {"a"}) is None
    assert 'static let keysLabel = "⌘⇧K"' in SWIFT
    assert 'static let action = "Previous unread chat"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "static func target" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isPreviousUnreadChord" in DESKTOP
    assert "previousUnreadBlocked" in DESKTOP
    assert "previousUnreadShouldOpen" in DESKTOP
    assert "previousUnreadChatId" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "chatOpen" not in DESKTOP.split("export function previousUnreadBlocked")[1].split("export function")[0]


def test_existing_open_path() -> None:
    start = CHAT.index("func previousUnreadKey")
    end = CHAT.index("func previousUnreadFromComposer", start)
    key = CHAT[start:end]
    assert "PreviousUnreadChat.isChord" in key
    assert "hasRealAgent" not in key
    assert "composerFocused" in key
    assert "previousUnreadBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "openPreviousUnread()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("openPreviousUnread()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "openPreviousUnread()" in follow
    assert "openPreviousUnreadChat()" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    assert "func openPreviousUnreadChat" in MODEL
    assert "PreviousUnreadChat.target" in MODEL
    assert "jumpChatIds()" in MODEL
    assert "showsUnreadDot" in MODEL
    assert "wantsComposerFocus = true" in MODEL
    assert "await select(previous, push: true)" in MODEL
    commands = COMPOSER[
        COMPOSER.index("func previousUnreadCommands") : COMPOSER.index(
            "func regenerateLastReplyCommands"
        )
    ]
    assert 'input: "k"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func previousUnreadFromShortcut") : COMPOSER.index(
            "func regenerateLastReplyFromShortcut"
        )
    ]
    assert "markedTextRange != nil" in selector
    assert "previousUnreadConsumed" in selector
    assert "onPreviousUnread?()" in selector
    assert selector.index("if previousUnreadConsumed") < selector.index("previousUnreadConsumed = true")
    assert selector.index("previousUnreadConsumed = true") < selector.index("onPreviousUnread?()")
    assert "keyboardK" in COMPOSER
    assert "model.send(" not in commands
    assert "const onPreviousUnread" in APP
    assert "previousUnreadChatId(ids, activeId, unread)" in APP
    assert "selectAgentRef.current(previous)" in APP
    assert 'addEventListener("keydown", onPreviousUnread, true)' in APP
    assert "previousUnreadShouldOpen" in APP
    assert "paintsUnreadAccent" in APP
    handler = APP[
        APP.index("const onPreviousUnread") : APP.index(
            'addEventListener("keydown", onPreviousUnread, true)'
        )
    ]
    assert "chatOpen: active != null" not in handler
    assert handler.index("preventDefault") < handler.index("previousUnreadShouldOpen")
    assert handler.index("previousUnreadShouldOpen") < handler.index(
        "selectAgentRef.current(previous)"
    )
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "PreviousUnreadChat.keysLabel" in SHEET
    assert "PreviousUnreadChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.21 " in ROADMAP
    assert "## 121. v1.21" in SPEC
    assert "python3 ios/scripts/test_ios_previous_unread_chat.py" in CI
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
