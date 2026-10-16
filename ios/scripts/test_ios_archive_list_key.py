#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.16 open or close Archived chats from the keyboard.

Hardware command-shift-H or control-shift-H toggles the Archived list
the same way the Archived (n) control does. It works while a chat is
open and while none is open. The composer does not own the chord and
does not insert the letter. A key repeat does not flap. IME and any
other text field do. Nothing opens when no chat is archived and the
list is already closed. No new HTTP. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ArchiveListKey.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "archiveListKey.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.16 open or close Archived chats from the keyboard (Cmd/Ctrl-Shift-H toggles "
    "the sidebar Archived list the same way the Archived (n) control does: open when "
    "that list is closed and at least one chat is archived, close when it is open; it "
    "works while a chat is open and while none is open; the chord still works from the "
    "composer and does not insert text; a key repeat does not flap and does not insert; "
    "IME composition keeps the key; find, the quick switcher, the shortcuts list, "
    "rename, the lightbox, a modal or overlay text field, and a focused widget, "
    "approve, or connect card keep the key; nothing opens when no chat is archived and "
    "the list is already closed; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, "
    "Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, "
    "Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, "
    "Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, "
    "PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts "
    "list includes Cmd/Ctrl Shift H; iOS hardware command-shift-H toggles that "
    "Archived list and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "h":
        return True
    return characters.lower() == "h"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def next_open(open_, count):
    if open_:
        return False
    return count > 0


def test_chord_and_toggle() -> None:
    assert is_chord("h", command=True, shift=True) is True
    assert is_chord("H", control=True, shift=True) is True
    assert is_chord("h", command=True, shift=True, characters="h") is True
    assert is_chord("h") is False
    assert is_chord("h", command=True) is False
    assert is_chord("h", command=True, shift=True, option=True) is False
    assert is_chord("h", command=True, control=True, shift=True) is False
    assert is_chord("g", command=True, shift=True) is False
    assert is_chord("a", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert next_open(False, 2) is True
    assert next_open(True, 2) is False
    assert next_open(False, 0) is False
    assert next_open(True, 0) is False
    assert 'static let keysLabel = "⌘⇧H"' in SWIFT
    assert 'static let action = "Open or close Archived chats"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "static func nextOpen" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isArchiveListChord" in DESKTOP
    assert "archiveListBlocked" in DESKTOP
    assert "archiveListShouldToggle" in DESKTOP
    assert "nextArchiveListOpen" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "chatOpen" not in DESKTOP.split("export function archiveListBlocked")[1].split("export function")[0]


def test_existing_toggle_path() -> None:
    start = CHAT.index("func archiveListKey")
    end = CHAT.index("func toggleArchiveListFromComposer", start)
    key = CHAT[start:end]
    assert "ArchiveListKey.isChord" in key
    assert "hasRealAgent" not in key
    assert "composerFocused" in key
    assert "archiveListBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "toggleArchivedList()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("toggleArchivedList()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "toggleArchivedList()" in follow
    assert "toggleArchivedListFromChord()" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    list_key = LIST[LIST.index("func archiveListKey") : LIST.index("private var styledList")]
    assert "ArchiveListKey.isChord" in list_key
    assert "toggleArchivedListFromChord()" in list_key
    assert "shouldIgnoreRepeat" in list_key
    assert "model.showArchivedList = true" in LIST
    assert "model.showArchivedList = false" in LIST
    assert "archiveListShowing = showArchived" in LIST
    assert "func toggleArchivedListFromChord" in MODEL
    assert "ArchiveListKey.nextOpen" in MODEL
    assert "var showArchivedList = false" in MODEL
    commands = COMPOSER[
        COMPOSER.index("func archiveListCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "h"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func toggleArchiveListFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "archiveListConsumed" in selector
    assert "onToggleArchiveList?()" in selector
    assert selector.index("if archiveListConsumed") < selector.index("archiveListConsumed = true")
    assert selector.index("archiveListConsumed = true") < selector.index("onToggleArchiveList?()")
    assert "keyboardH" in COMPOSER
    assert "model.send(" not in commands
    assert "const onToggleArchiveList" in APP
    assert "nextArchiveListOpen(open, archivedAgents.length)" in APP
    assert 'addEventListener("keydown", onToggleArchiveList, true)' in APP
    assert "archiveListShouldToggle" in APP
    assert "chatOpen: active != null" not in APP[
        APP.index("const onToggleArchiveList") : APP.index(
            'addEventListener("keydown", onToggleArchiveList, true)'
        )
    ]
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "ArchiveListKey.keysLabel" in SHEET
    assert "ArchiveListKey.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.16 " in ROADMAP
    assert "## 116. v1.16" in SPEC
    assert "python3 ios/scripts/test_ios_archive_list_key.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_toggle,
        test_existing_toggle_path,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
