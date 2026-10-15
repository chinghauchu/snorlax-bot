#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.06 archive the open chat from the keyboard.

Hardware command-shift-A or control-shift-A archives the open chat
through the same archiveChat path as the chat-list Archive action.
The next visible chat opens, or the empty state. The composer does
not own the chord. IME and any other text field do. Nothing is
archived when no chat is open. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ArchiveOpenChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "archiveOpenChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.06 archive the open chat from the keyboard (Cmd/Ctrl-Shift-A archives "
    "the currently open chat through the same path as the sidebar Archive "
    "action; if that open chat is archived, the next chat in Alt+Up/Down "
    "visible order opens, or the empty state; the chord still works from the "
    "composer because the platform does nothing useful with Shift-A there for "
    "chat; IME composition keeps the key; find, the quick switcher, the "
    "shortcuts list, rename, the lightbox, a modal or overlay text field, and "
    "a focused widget, approve, or connect card keep the key; nothing is "
    "archived when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, "
    "Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, "
    "PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the "
    "shortcuts list includes Cmd/Ctrl Shift A; iOS hardware command-shift-A "
    "archives the open chat the same way and is listed in Gestures & "
    "shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "a":
        return True
    return characters.lower() == "a"


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_and_composer() -> None:
    assert is_chord("a", command=True, shift=True) is True
    assert is_chord("A", control=True, shift=True) is True
    assert is_chord("a", command=True, shift=True, characters="a") is True
    assert is_chord("a") is False
    assert is_chord("a", command=True) is False
    assert is_chord("a", command=True, shift=True, option=True) is False
    assert is_chord("a", command=True, control=True, shift=True) is False
    assert is_chord("c", command=True, shift=True) is False
    assert is_chord("n", command=True) is False
    assert is_chord("k", command=True, shift=True) is False
    assert is_chord("1", command=True) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧A"' in SWIFT
    assert 'static let action = "Archive this chat"' in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isArchiveOpenChatChord" in DESKTOP
    assert "archiveOpenChatBlocked" in DESKTOP
    assert "overlayTextFieldOwnsArchiveOpenChat" in DESKTOP
    assert "No HTTP" in DESKTOP


def test_existing_archive_path() -> None:
    start = CHAT.index("func archiveOpenChatKey")
    end = CHAT.index("func archiveOpenChatFromComposer", start)
    key = CHAT[start:end]
    assert "ArchiveOpenChat.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "findOpen" in key
    assert "shortcutsOpen" in key
    assert "lightbox != nil" in key
    assert "model.archiveChat(agent.id)" in key
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "model.archiveChat(agent.id)" in follow
    assert "hasRealAgent" in follow
    assert "model.send(" not in follow
    archive = MODEL[MODEL.index("func archiveChat(_ id: String)") : MODEL.index("func unarchiveChat")]
    assert "ChatArchive.selectionAfterArchive" in archive
    assert "visibleChatOrder()" in archive
    commands = COMPOSER[
        COMPOSER.index("func archiveOpenChatCommands") : COMPOSER.index("func chatNavCommands")
    ]
    assert 'input: "a"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "func archiveOpenChatFromShortcut" in COMPOSER
    assert "markedTextRange != nil" in COMPOSER
    assert "onArchiveOpenChat?()" in COMPOSER
    assert "model.send(" not in commands
    assert "const onArchiveOpenChat" in APP
    assert "onArchive(id)" in APP
    assert 'addEventListener("keydown", onArchiveOpenChat, true)' in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "ArchiveOpenChat.keysLabel" in SHEET
    assert "ArchiveOpenChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.06 " in ROADMAP
    assert "## 106. v1.06" in SPEC
    assert "python3 ios/scripts/test_ios_archive_open_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_composer,
        test_existing_archive_path,
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
