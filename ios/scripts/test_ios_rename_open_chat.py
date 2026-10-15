#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.11 rename the open chat from the keyboard.

Hardware command-shift-R or control-shift-R starts rename on the open
chat through the same list inline field as the Rename action. Enter
or leaving the field keeps a trimmed non-empty name. Escape restores
the previous one. A blank name is rejected. The composer does not own
the chord and does not insert the letter. IME and any other text field
do. A key repeat does not start a second rename. Nothing changes when
no chat is open. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "RenameOpenChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
NAMES = (IOS / "ChatNames.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "renameOpenChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.11 rename the open chat from the keyboard (Cmd/Ctrl-Shift-R starts "
    "rename on the currently open chat through the same local-state path as "
    "the v0.95 sidebar Rename action; the name becomes an inline field; Enter "
    "or blur keeps a trimmed non-empty name and Escape restores the previous "
    "one; a blank name is rejected; the chord still works from the composer "
    "and does not insert text; IME composition keeps the key; a key repeat "
    "does not start a second rename; if rename is already in progress the "
    "chord does not flap; find, the quick switcher, the shortcuts list, the "
    "lightbox, a modal or overlay text field, and a focused widget, approve, "
    "or connect card keep the key; nothing changes when no chat is open; "
    "Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, "
    "Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, "
    "Cmd/Ctrl-Shift-M, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, "
    "PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the "
    "shortcuts list includes Cmd/Ctrl Shift R; iOS hardware command-shift-R "
    "starts that same rename and is listed in Gestures & shortcuts; "
    "no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "r":
        return True
    return characters.lower() == "r"


def should_ignore_repeat(is_repeat):
    return is_repeat


def should_start(is_repeat, renaming):
    return (not is_repeat) and (not renaming)


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_repeat_and_field() -> None:
    assert is_chord("r", command=True, shift=True) is True
    assert is_chord("R", control=True, shift=True) is True
    assert is_chord("r", command=True, shift=True, characters="r") is True
    assert is_chord("r") is False
    assert is_chord("r", command=True) is False
    assert is_chord("r", command=True, shift=True, option=True) is False
    assert is_chord("r", command=True, control=True, shift=True) is False
    assert is_chord("p", command=True, shift=True) is False
    assert is_chord("m", command=True, shift=True) is False
    assert is_chord("a", command=True, shift=True) is False
    assert is_chord("n", command=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert should_start(False, False) is True
    assert should_start(True, False) is False
    assert should_start(False, True) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧R"' in SWIFT
    assert 'static let action = "Rename this chat"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "shouldStart" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isRenameOpenChatChord" in DESKTOP
    assert "renameOpenChatBlocked" in DESKTOP
    assert "renameOpenChatShouldStart" in DESKTOP
    assert "overlayTextFieldOwnsRenameOpenChat" in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "func commit(" in NAMES


def test_existing_rename_path() -> None:
    start = CHAT.index("func renameOpenChatKey")
    end = CHAT.index("func renameOpenChatFromComposer", start)
    key = CHAT[start:end]
    assert "RenameOpenChat.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "findOpen" in key
    assert "shortcutsOpen" in key
    assert "lightbox != nil" in key
    assert "shouldStart" in key
    assert "model.beginRenameOpenChat(agent.id)" in key
    assert key.index("shouldStart") < key.index("model.beginRenameOpenChat")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "model.beginRenameOpenChat(agent.id)" in follow
    assert "hasRealAgent" in follow
    assert "model.send(" not in follow
    start_fn = MODEL[
        MODEL.index("func beginRenameOpenChat(_ id: String)") : MODEL.index("func noteListRename")
    ]
    assert "if renameChatID != nil { return }" in start_fn
    assert "renameChatID = id" in start_fn
    assert "ChatNames.commit" not in start_fn
    assert "func noteListRename(_ id: String)" in MODEL
    assert "func endRename(_ id: String)" in MODEL
    assert "model.noteListRename(agent.id)" in LIST
    assert "renamingID" in LIST
    assert "model.renameChatID" in LIST
    assert "model.commitChatName(" in LIST
    assert "model.endRename(agent.id)" in LIST
    assert "ChatRenameField" in LIST
    commands = COMPOSER[
        COMPOSER.index("func renameOpenChatCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "r"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func renameOpenChatFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "renameOpenChatConsumed" in selector
    assert "onRenameOpenChat?()" in selector
    assert selector.index("if renameOpenChatConsumed") < selector.index("renameOpenChatConsumed = true")
    assert selector.index("renameOpenChatConsumed = true") < selector.index("onRenameOpenChat?()")
    assert "model.send(" not in commands
    assert "const onRenameOpenChat" in APP
    assert "beginRename(agent)" in APP
    assert 'addEventListener("keydown", onRenameOpenChat, true)' in APP
    assert "renameOpenChatShouldStart" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "RenameOpenChat.keysLabel" in SHEET
    assert "RenameOpenChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.11 " in ROADMAP
    assert "## 111. v1.11" in SPEC
    assert "python3 ios/scripts/test_ios_rename_open_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_repeat_and_field,
        test_existing_rename_path,
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
