#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.12 delete the open chat from the keyboard.

Hardware command-shift-D or control-shift-D opens the same confirm
as sidebar Delete. It does not delete until that confirm. Enter or
Delete confirms. Esc or Cancel aborts, and focus returns to the
composer. A key repeat never confirms. Only the confirm runs the
existing removal. After that, the next chat in the Option+Up/Down
visible order opens, or the empty state. The composer does not own
the chord and does not insert the letter. IME and any other text
field do. Nothing is deleted when no chat is open. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "DeleteOpenChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "deleteOpenChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.12 delete the open chat from the keyboard (Cmd/Ctrl-Shift-D opens "
    "the same confirm as the sidebar Delete… menu and does not delete until "
    "that confirm; Enter or Delete confirms, Esc or Cancel aborts, and "
    "focus returns to the composer on cancel; a key repeat never confirms; "
    "only on confirm does the existing delete path run, then the next chat "
    "in the Alt+Up/Down visible order opens, or the empty state; the chord "
    "still works from the composer and does not insert text; IME composition "
    "keeps the key; find, the quick switcher, the shortcuts list, rename, "
    "the lightbox, a modal or overlay text field, and a focused widget, "
    "approve, or connect card keep the key; nothing is deleted when no chat "
    "is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, "
    "Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, "
    "Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, "
    "Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, "
    "Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list "
    "includes Cmd/Ctrl Shift D; iOS hardware command-shift-D opens that "
    "same confirm and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "d":
        return True
    return characters.lower() == "d"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_repeat_and_field() -> None:
    assert is_chord("d", command=True, shift=True) is True
    assert is_chord("D", control=True, shift=True) is True
    assert is_chord("d", command=True, shift=True, characters="d") is True
    assert is_chord("d") is False
    assert is_chord("d", command=True) is False
    assert is_chord("d", command=True, shift=True, option=True) is False
    assert is_chord("d", command=True, control=True, shift=True) is False
    assert is_chord("r", command=True, shift=True) is False
    assert is_chord("p", command=True, shift=True) is False
    assert is_chord("a", command=True, shift=True) is False
    assert is_chord("n", command=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧D"' in SWIFT
    assert 'static let action = "Ask to delete this chat"' in SWIFT
    assert "func confirmAction(" in SWIFT
    assert "func confirmTitle(" in SWIFT
    assert "func blockConfirmKey(" in SWIFT
    assert 'return isRepeat ? "swallow" : "confirm"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "func nextId" in SWIFT
    assert "ChatArchive.selectionAfterArchive" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isDeleteOpenChatChord" in DESKTOP
    assert "deleteOpenChatBlocked" in DESKTOP
    assert "deleteOpenChatShouldRun" in DESKTOP
    assert "nextOpenChatAfterDelete" in DESKTOP
    assert "overlayTextFieldOwnsDeleteOpenChat" in DESKTOP
    assert "No new HTTP" in DESKTOP


def test_existing_delete_path() -> None:
    start = CHAT.index("func deleteOpenChatKey")
    end = CHAT.index("func deleteOpenChatFromComposer", start)
    key = CHAT[start:end]
    assert "DeleteOpenChat.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "findOpen" in key
    assert "shortcutsOpen" in key
    assert "lightbox != nil" in key
    assert "shouldIgnoreRepeat" in key
    assert "requestDeleteOpenChat()" in key
    assert "model.deleteOpenChat" not in key
    assert key.index("shouldIgnoreRepeat") < key.index("requestDeleteOpenChat()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "requestDeleteOpenChat()" in follow
    assert "model.deleteOpenChat" not in follow
    assert "hasRealAgent" in follow
    assert "model.send(" not in follow
    assert "func confirmDeleteOpenChat" in CHAT
    assert "model.deleteOpenChat(id)" in CHAT
    assert "func cancelDeleteOpenChat" in CHAT
    assert "composerFocused = true" in CHAT
    assert "DeleteOpenChat.confirmTitle" in CHAT
    assert "DeleteOpenChat.confirmAction" in CHAT
    assert ".keyboardShortcut(.defaultAction)" in CHAT
    assert ".keyboardShortcut(.cancelAction)" in CHAT
    assert "confirmationDialog" in CHAT
    start_fn = MODEL[
        MODEL.index("func deleteOpenChat(_ id: String)") : MODEL.index("func saveProfile")
    ]
    assert "!deleteOpenChatBusy" in start_fn
    assert "DeleteOpenChat.nextId" in start_fn
    assert "visibleChatOrder()" in start_fn
    assert "preferVisibleNext: true" in start_fn
    assert start_fn.index("!deleteOpenChatBusy") < start_fn.index("await delete(")
    removal = MODEL[MODEL.index("func delete(") : MODEL.index("func deleteOpenChat(_ id: String)")]
    assert "client.deleteAgent(id: agent.id)" in removal
    assert "nextRosterSelection" in removal
    assert "preferVisibleNext" in removal
    commands = COMPOSER[
        COMPOSER.index("func deleteOpenChatCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "d"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func deleteOpenChatFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "deleteOpenChatConsumed" in selector
    assert "onDeleteOpenChat?()" in selector
    assert selector.index("if deleteOpenChatConsumed") < selector.index("deleteOpenChatConsumed = true")
    assert selector.index("deleteOpenChatConsumed = true") < selector.index("onDeleteOpenChat?()")
    assert "model.send(" not in commands
    assert "const onDeleteOpenChat" in APP
    assert "setPendingDelete(agent)" in APP
    assert "deleteRosterChat(doomed, nextOpen)" in APP
    assert "function cancelDelete()" in APP
    assert "deleteConfirmAction(" in APP
    assert "nextOpenChatAfterDelete" in APP
    assert 'addEventListener("keydown", onDeleteOpenChat, true)' in APP
    assert "deleteOpenChatShouldRun" in APP
    assert "deleteAgent(session, doomed.id)" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "DeleteOpenChat.keysLabel" in SHEET
    assert "DeleteOpenChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.12 " in ROADMAP
    assert "## 112. v1.12" in SPEC
    assert "python3 ios/scripts/test_ios_delete_open_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_repeat_and_field,
        test_existing_delete_path,
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
