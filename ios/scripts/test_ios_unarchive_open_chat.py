#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.22 unarchive the open chat from the keyboard.

Hardware command-shift-B or control-shift-B restores the open chat
through the same unarchiveChat path as the chat-list Unarchive action
when that chat is archived. The chat leaves the Archived list and
returns to the main list. The open chat stays open. Nothing changes
when no chat is open or the open chat is not archived. Command-shift-A
still only archives. The composer does not own the chord and does not
insert the letter. A key repeat does not unarchive again. IME and any
other text field do. No new HTTP. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "UnarchiveOpenChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "unarchiveOpenChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.22 unarchive the open chat from the keyboard (Cmd/Ctrl-Shift-B restores "
    "the currently open chat through the same path as the sidebar Unarchive action "
    "when that chat is archived, so it leaves the Archived list and returns to the "
    "main list in pin and recency order; the open chat stays open; nothing changes "
    "when no chat is open or the open chat is not archived; Cmd/Ctrl-Shift-A still "
    "only archives and does not unarchive; the chord still works from the composer "
    "and does not insert text; a key repeat does not unarchive again and does not "
    "insert; IME composition keeps the key; find, the quick switcher, the shortcuts "
    "overlay, rename, the lightbox, a modal or overlay text field, and a focused "
    "widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, "
    "Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, "
    "Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, "
    "Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, "
    "Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, "
    "Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, Cmd/Ctrl-1..9, "
    "Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; "
    "the shortcuts list includes Cmd/Ctrl Shift B; iOS hardware command-shift-B "
    "unarchives that chat and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "b":
        return True
    return characters.lower() == "b"


def should_ignore_repeat(is_repeat):
    return is_repeat


def should_run(archived, repeat=False):
    if repeat:
        return False
    return archived


def unarchive(ids, chat_id):
    if not chat_id or chat_id not in ids:
        return list(ids)
    return [row for row in ids if row != chat_id]


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_and_archive_set() -> None:
    assert is_chord("b", command=True, shift=True) is True
    assert is_chord("B", control=True, shift=True) is True
    assert is_chord("b", command=True, shift=True, characters="b") is True
    assert is_chord("b") is False
    assert is_chord("b", command=True) is False
    assert is_chord("b", command=True, shift=True, option=True) is False
    assert is_chord("b", command=True, control=True, shift=True) is False
    assert is_chord("a", command=True, shift=True) is False
    assert is_chord("k", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert should_run(True) is True
    assert should_run(False) is False
    assert should_run(True, repeat=True) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert unarchive(["a", "b"], "a") == ["b"]
    assert unarchive(["b"], "a") == ["b"]
    assert unarchive(["a"], "") == ["a"]
    assert 'static let keysLabel = "⌘⇧B"' in SWIFT
    assert 'static let action = "Unarchive this chat"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isUnarchiveOpenChatChord" in DESKTOP
    assert "unarchiveOpenChatBlocked" in DESKTOP
    assert "unarchiveOpenChatShouldRun" in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "chatOpen" in DESKTOP.split("export function unarchiveOpenChatBlocked")[1].split("export function")[0]


def test_existing_unarchive_path() -> None:
    start = CHAT.index("func unarchiveOpenChatKey")
    end = CHAT.index("func unarchiveOpenChatFromComposer", start)
    key = CHAT[start:end]
    assert "UnarchiveOpenChat.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "unarchiveOpenChatBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "model.isChatArchived(agent.id)" in key
    assert "model.unarchiveChat(agent.id)" in key
    assert key.index("shouldIgnoreRepeat") < key.index("model.isChatArchived(agent.id)")
    assert key.index("model.isChatArchived(agent.id)") < key.index("model.unarchiveChat(agent.id)")
    assert "model.send(" not in key
    assert "model.archiveChat(" not in key
    follow = CHAT[end : CHAT.index("func unarchiveOpenChatBlocked", end)]
    assert "model.unarchiveChat(agent.id)" in follow
    assert "model.isChatArchived(agent.id)" in follow
    assert "model.send(" not in follow
    assert "model.archiveChat(" not in follow
    blocked = CHAT[
        CHAT.index("func unarchiveOpenChatBlocked") : CHAT.index("func clearComposerDraftKey")
    ]
    assert "findOpen" in blocked
    assert "shortcutsOpen" in blocked
    assert "lightbox != nil" in blocked
    assert "renameChatID != nil" in blocked
    assert "func unarchiveChat(_ id: String)" in MODEL
    unarchive = MODEL[
        MODEL.index("func unarchiveChat(_ id: String)") : MODEL.index("func retainChatArchives")
    ]
    assert "ChatArchive.unarchive" in unarchive
    assert "selectedAgentID" not in unarchive
    assert "model.unarchiveChat(agent.id)" in LIST
    assert "ChatArchive.unarchiveLabel" in LIST
    commands = COMPOSER[
        COMPOSER.index("func unarchiveOpenChatCommands") : COMPOSER.index(
            "func archiveOpenChatCommands"
        )
    ]
    assert 'input: "b"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func unarchiveOpenChatFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "unarchiveOpenChatConsumed" in selector
    assert "onUnarchiveOpenChat?()" in selector
    assert selector.index("if unarchiveOpenChatConsumed") < selector.index(
        "unarchiveOpenChatConsumed = true"
    )
    assert selector.index("unarchiveOpenChatConsumed = true") < selector.index(
        "onUnarchiveOpenChat?()"
    )
    assert "keyboardB" in COMPOSER
    assert "model.send(" not in commands
    handler = APP[
        APP.index("const onUnarchiveOpenChat") : APP.index(
            'addEventListener("keydown", onUnarchiveOpenChat, true)'
        )
    ]
    assert "chatOpen: active != null" in handler
    assert "isChatArchived(archivedChatIds, active.id)" in handler
    assert "onUnarchive(id)" in APP
    assert handler.index("preventDefault") < handler.index("unarchiveOpenChatShouldRun")
    assert handler.index("unarchiveOpenChatShouldRun") < handler.index(
        "unarchiveOpenChatRef.current()"
    )
    assert "onArchive(" not in handler
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "UnarchiveOpenChat.keysLabel" in SHEET
    assert "UnarchiveOpenChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.22 " in ROADMAP
    assert "## 122. v1.22" in SPEC
    assert "python3 ios/scripts/test_ios_unarchive_open_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_archive_set,
        test_existing_unarchive_path,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
