#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.19 focus the sidebar chat list from the keyboard.

Hardware command-shift-S or control-shift-S moves focus into the
sidebar chat list. The open chat's row is preferred when it is
visible. Otherwise the first visible row. The composer does not own
the chord and does not insert the letter. A key repeat does not move
focus again. IME and any other text field do. No new HTTP. OpenAPI
stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "FocusSidebarList.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "focusSidebarList.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.19 focus the sidebar chat list from the keyboard (Cmd/Ctrl-Shift-S "
    "moves focus into the sidebar chat list when the open chat is showing and "
    "focus is in the composer or elsewhere in the chat column; the currently "
    "open chat's row is focused when it is visible, otherwise the first visible "
    "row in the current All / Unread, pin, and archive view; once that row is "
    "focused, Up and Down move to the previous or next visible row and keep "
    "focus in the list; the chord still works from the composer and does not "
    "insert text; a key repeat does not move focus again and does not insert; "
    "IME composition keeps the key; find, the quick switcher, the shortcuts "
    "list, rename, the lightbox, a modal or overlay text field, and a focused "
    "widget, approve, or connect card keep the key; a sidebar row that already "
    "has focus keeps the key; nothing changes when there is no chat list to "
    "focus; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, "
    "Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, "
    "Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, "
    "Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, "
    "Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, "
    "PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the "
    "shortcuts list includes Cmd/Ctrl Shift S; iOS hardware command-shift-S "
    "focuses that list and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "s":
        return True
    return characters.lower() == "s"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def target(ids, open_id):
    visible = [item for item in ids if item]
    if not visible:
        return None
    if open_id in visible:
        return open_id
    return visible[0]


def test_chord() -> None:
    assert is_chord("s", command=True, shift=True) is True
    assert is_chord("S", control=True, shift=True) is True
    assert is_chord("s", command=True, shift=True, characters="s") is True
    assert is_chord("s") is False
    assert is_chord("s", command=True) is False
    assert is_chord("s", command=True, shift=True, option=True) is False
    assert is_chord("s", command=True, control=True, shift=True) is False
    assert is_chord("y", command=True, shift=True) is False
    assert is_chord("j", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert target(["pin", "rest"], "rest") == "rest"
    assert target(["pin", "rest"], "hidden") == "pin"
    assert target(["pin", "rest"], None) == "pin"
    assert target([], "pin") is None
    assert target(["", "rest"], "missing") == "rest"
    assert 'static let keysLabel = "⌘⇧S"' in SWIFT
    assert 'static let action = "Focus the chat list"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "func target" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isFocusSidebarChord" in DESKTOP
    assert "focusSidebarBlocked" in DESKTOP
    assert "focusSidebarShouldMove" in DESKTOP
    assert "sidebarFocusTargetId" in DESKTOP
    assert "sidebarListArrowDirection" in DESKTOP
    assert "No new HTTP" in DESKTOP


def test_wiring() -> None:
    start = CHAT.index("func focusSidebarKey")
    end = CHAT.index("func focusSidebarFromComposer", start)
    key = CHAT[start:end]
    assert "FocusSidebarList.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "focusSidebarBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "focusSidebarFromChord()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("focusSidebarFromChord()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func openFind", end)]
    assert "focusSidebarFromChord()" in follow
    assert "model.focusSidebarListFromChord()" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    assert "func focusSidebarListFromChord()" in MODEL
    assert "FocusSidebarList.target(" in MODEL
    assert "sidebarKeyboardFocus = true" in MODEL
    assert "navigationPath = []" in MODEL
    commands = COMPOSER[
        COMPOSER.index("func focusSidebarCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "s"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func focusSidebarFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "focusSidebarConsumed" in selector
    assert "onFocusSidebarList?()" in selector
    assert selector.index("if focusSidebarConsumed") < selector.index(
        "focusSidebarConsumed = true"
    )
    assert selector.index("focusSidebarConsumed = true") < selector.index(
        "onFocusSidebarList?()"
    )
    assert "keyboardS" in COMPOSER
    assert "model.send(" not in commands
    assert "const onFocusSidebar" in APP
    assert "sidebarFocusTargetId(" in APP
    assert "focusSidebarRow(target)" in APP
    assert 'addEventListener("keydown", onFocusSidebar, true)' in APP
    assert "focusSidebarShouldMove" in APP
    assert "sidebarListArrowDirection(" in APP
    assert 'loadConversation(id, null, "sidebar")' in APP
    assert "data-roster-id" in APP
    assert "focusedChatID" in LIST
    assert "sidebarFocusRequest" in LIST
    assert ".focused($focusedChatID, equals: agent.id)" in LIST
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "FocusSidebarList.keysLabel" in SHEET
    assert "FocusSidebarList.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.19 " in ROADMAP
    assert "## 119. v1.19" in SPEC
    assert "python3 ios/scripts/test_ios_focus_sidebar_list.py" in CI
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
