#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.05 jump to a numbered chat.

Hardware command-1 through command-8, or control-1 through control-8,
opens that chat in the chat list's current visible order. Command-9
opens the last chat, matching Slack and browsers. A number past the
visible count does nothing. The composer does not own the chord.
IME and any other text field do. Opening uses select, the same path
as tapping the row, so per-chat drafts stay. No new HTTP. OpenAPI
stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ChatJump.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatJump.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.05 jump to a numbered chat (Cmd/Ctrl-1 through Cmd/Ctrl-8 opens that "
    "chat in the sidebar's current visible order, the same order Alt+Up/Down "
    "uses: the Pinned group first, section headers ignored, the All / Unread "
    "filter applied, archived chats excluded unless the archived list is "
    "showing; Cmd/Ctrl-9 opens the last visible chat, matching Slack and "
    "browsers; a number past the visible count does nothing; the chord works "
    "while the composer is focused and opening the chat is the same as "
    "clicking the sidebar row, so per-chat drafts stay; IME composition keeps "
    "the key; find, the quick switcher, the shortcuts list, rename, the "
    "lightbox, a modal or overlay text field, and a focused widget, approve, "
    "or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, "
    "Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-/, Alt+Up/Down, PageUp/PageDown, "
    "Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list "
    "includes Cmd/Ctrl 1-9; iOS hardware command-1 through command-9 uses the "
    "chat list order, with command-9 opening the last chat, and is listed in "
    "Gestures & shortcuts; no new HTTP)"
)


def slot(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or shift:
        return None
    if command == control:
        return None
    raw = key if len(key) == 1 and key.isdigit() else characters
    if len(raw) == 1 and raw.isdigit():
        value = int(raw)
        if 1 <= value <= 9:
            return value
    return None


def target(ids, number):
    rows = [row for row in ids if row]
    if number < 1 or number > 9 or not rows:
        return None
    if number == 9:
        return rows[-1]
    if number > len(rows):
        return None
    return rows[number - 1]


def order(main_ids, archived_ids, showing, replaces):
    main = [row for row in main_ids if row]
    archived = [row for row in archived_ids if row]
    if showing and replaces:
        return archived
    if not showing:
        return main
    seen = set(main)
    return main + [row for row in archived if row not in seen]


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_slots_and_order() -> None:
    assert slot("1", command=True) == 1
    assert slot("8", control=True) == 8
    assert slot("9", command=True) == 9
    assert slot("1", command=True, characters="1") == 1
    assert slot("1") is None
    assert slot("1", command=True, shift=True) is None
    assert slot("1", command=True, option=True) is None
    assert slot("1", command=True, control=True) is None
    assert slot("n", command=True) is None
    assert slot("k", command=True) is None
    assert slot("0", command=True) is None
    three = ["a", "b", "c"]
    assert target(three, 1) == "a"
    assert target(three, 4) is None
    assert target(three, 9) == "c"
    twelve = list("abcdefghijkl")
    assert target(twelve, 8) == "h"
    assert target(twelve, 9) == "l"
    assert target([], 1) is None
    assert target([], 9) is None
    main = ["pin-a", "chat-b"]
    archived = ["old-1"]
    assert order(main, archived, False, False) == main
    assert order(main, archived, True, False) == ["pin-a", "chat-b", "old-1"]
    assert order(main, archived, True, True) == archived
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘1-⌘9"' in SWIFT
    assert 'static let action = "Open a chat (9 is last)"' in SWIFT
    assert "func slot" in SWIFT
    assert "func target" in SWIFT
    assert "func order" in SWIFT
    assert "archiveReplacesMain" in SWIFT
    assert "func overlayTextFieldOwnsChord" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "Cmd/Ctrl 1-9" in DESKTOP
    assert "chatJumpSlot" in DESKTOP
    assert "chatIdAtJumpSlot" in DESKTOP
    assert "visibleJumpIds" in DESKTOP
    assert "9 is the last" in DESKTOP


def test_existing_open_path() -> None:
    start = MODEL.index("func openChatAtJumpSlot")
    end = MODEL.index("func openJump", start)
    chord = MODEL[start:end]
    assert "ChatJump.target" in chord
    assert "jumpChatIds()" in chord
    assert "await select(id, push: true)" in chord
    assert "wantsComposerFocus = true" in chord
    assert "send(" not in chord
    ids = MODEL[MODEL.index("func jumpChatIds") : MODEL.index("func openChatAtJumpSlot")]
    assert "visibleChatOrder()" in ids
    assert "archivedAgents" in ids
    assert "archiveReplacesMain: true" in ids
    assert "func jumpChatKey" in CHAT
    assert "ChatJump.slot" in CHAT
    assert "openChatAtJumpSlot" in CHAT
    assert "composerFocused" in CHAT
    assert "findOpen" in CHAT
    assert "shortcutsOpen" in CHAT
    assert "lightbox != nil" in CHAT
    assert "func jumpChatKey" in LIST
    assert "ChatJump.slot" in LIST
    assert "openChatAtJumpSlot" in LIST
    assert "renamingID" in LIST
    assert "archiveListShowing = showArchived" in LIST
    commands = COMPOSER[
        COMPOSER.index("func jumpChatCommands") : COMPOSER.index("func chatNavCommands")
    ]
    assert 'input: digit' in commands
    assert "modifierFlags: .command" in commands
    assert "modifierFlags: .control" in commands
    assert "func jumpChatFromShortcut" in COMPOSER
    assert "markedTextRange != nil" in COMPOSER
    assert "onJumpChat?(slot)" in COMPOSER
    assert "model.send(" not in commands
    assert "const onJumpChatKey" in APP
    assert "selectAgentRef.current(id)" in APP
    assert "visibleJumpIds(" in APP
    assert "archiveListShowing: archiveOpen" in APP
    assert 'addEventListener("keydown", onJumpChatKey, true)' in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "ChatJump.keysLabel" in SHEET
    assert "ChatJump.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.05 " in ROADMAP
    assert "## 105. v1.05" in SPEC
    assert "python3 ios/scripts/test_ios_chat_jump.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_slots_and_order,
        test_existing_open_path,
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
    sys.exit(main())
