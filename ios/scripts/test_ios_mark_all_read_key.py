#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.20 mark all as read from the keyboard.

Hardware command-shift-O or control-shift-O marks every chat read
through the same path as the Mark all as read control. Archived chats
and channel handoff dots are included. Nothing unread is a no-op.
The composer does not own the chord and does not insert the letter.
A key repeat does not clear again. IME and any other text field do.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkAllReadKey.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markAllReadKey.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.20 mark all as read from the keyboard (Cmd/Ctrl-Shift-O marks every "
    "chat read through the same local-state path as the v1.01 Mark all as "
    "read control under All / Unread; it clears every unread accent dot, "
    "including archived chats and channel handoff dots, so the window title "
    "and badge count go to zero and the Unread filter shows No unread chats; "
    "the chord is a no-op when nothing is unread; it still works from the "
    "composer and does not insert text; a key repeat does not clear again "
    "and does not insert; IME composition keeps the key; find, the quick "
    "switcher, the shortcuts overlay, rename, the lightbox, a modal or "
    "overlay text field, and a focused widget, approve, or connect card keep "
    "the key; it still clears when no chat is open, because the sidebar "
    "control does; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, "
    "Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, "
    "Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, "
    "Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, "
    "Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, "
    "Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, "
    "Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl "
    "Shift O; iOS hardware command-shift-O marks every chat read and is "
    "listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "o":
        return True
    return characters.lower() == "o"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord() -> None:
    assert is_chord("o", command=True, shift=True) is True
    assert is_chord("O", control=True, shift=True) is True
    assert is_chord("o", command=True, shift=True, characters="o") is True
    assert is_chord("o") is False
    assert is_chord("o", command=True) is False
    assert is_chord("o", command=True, shift=True, option=True) is False
    assert is_chord("o", command=True, control=True, shift=True) is False
    assert is_chord("s", command=True, shift=True) is False
    assert is_chord("y", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧O"' in SWIFT
    assert 'static let action = "Mark all as read"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isMarkAllReadChord" in DESKTOP
    assert "markAllReadKeyBlocked" in DESKTOP
    assert "markAllReadShouldClear" in DESKTOP
    assert "markAllReadIsNoOp" in DESKTOP
    assert "No new HTTP" in DESKTOP


def test_wiring() -> None:
    start = CHAT.index("func markAllReadKey")
    end = CHAT.index("func markAllReadFromComposer", start)
    key = CHAT[start:end]
    assert "MarkAllReadKey.isChord" in key
    assert "composerFocused" in key
    assert "markAllReadBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "markAllReadFromChord()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("markAllReadFromChord()")
    assert "hasRealAgent" not in key
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func openFind", end)]
    assert "markAllReadFromChord()" in follow
    assert "model.markAllChatsReadFromChord()" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    assert "func markAllChatsReadFromChord()" in MODEL
    chord = MODEL[
        MODEL.index("func markAllChatsReadFromChord()") : MODEL.index("func openJump(")
    ]
    assert "hasAnyUnreadChat" in chord
    assert "markAllChatsRead()" in chord
    assert chord.index("hasAnyUnreadChat") < chord.index("markAllChatsRead()")
    assert "/v1/" not in chord
    assert "func markAllReadKey" in LIST
    assert "model.markAllChatsReadFromChord()" in LIST
    commands = COMPOSER[
        COMPOSER.index("func markAllReadCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "o"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func markAllReadFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "markAllReadConsumed" in selector
    assert "onMarkAllRead?()" in selector
    assert selector.index("if markAllReadConsumed") < selector.index(
        "markAllReadConsumed = true"
    )
    assert selector.index("markAllReadConsumed = true") < selector.index(
        "onMarkAllRead?()"
    )
    assert "keyboardO" in COMPOSER
    assert "model.send(" not in commands
    assert "const onMarkAllReadKey" in APP
    assert "markAllReadIsNoOp" in APP
    assert "onMarkAllRead()" in APP
    assert 'addEventListener("keydown", onMarkAllReadKey, true)' in APP
    assert "markAllReadShouldClear" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "MarkAllReadKey.keysLabel" in SHEET
    assert "MarkAllReadKey.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.20 " in ROADMAP
    assert "## 120. v1.20" in SPEC
    assert "python3 ios/scripts/test_ios_mark_all_read_key.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord,
        test_wiring,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
