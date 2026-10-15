#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.15 toggle the All / Unread filter from the keyboard.

Hardware command-shift-F or control-shift-F flips the v0.88 All /
Unread control. All shows every chat. Unread shows only chats that
paint the accent dot. The empty state, pins, archives, and
UserDefaults stay. The composer does not own the chord and does not
insert the letter. A key repeat does not flap. IME and any other text
field do. The empty chat still toggles. Cmd-F still finds. No new
HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ChatListFilterKey.swift").read_text(encoding="utf-8")
FILTER = (IOS / "ChatListFilter.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatListFilterKey.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.15 toggle the All / Unread filter from the keyboard (Cmd/Ctrl-Shift-F toggles "
    "the sidebar All / Unread control shipped in v0.88, the same choice as clicking All "
    "or Unread; All shows every chat and Unread shows only chats that currently paint "
    "the accent dot; an empty Unread list still shows No unread chats; pinned unread "
    "chats stay in the Pinned group; archived chats stay out of that list; the choice "
    "still persists in local storage / UserDefaults; the chord still works from the "
    "composer and does not insert text; a key repeat does not flap and does not insert; "
    "IME composition keeps the key; find, the quick switcher, the shortcuts list, "
    "rename, the lightbox, a modal or overlay text field, and a focused widget, approve, "
    "or connect card keep the key; the filter still toggles when no chat is open because "
    "the sidebar control does; Cmd/Ctrl-F still finds and does not take Shift-F; "
    "Cmd/Ctrl-K, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, "
    "Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, "
    "Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-/, "
    "Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow "
    "recall stay; the shortcuts list includes Cmd/Ctrl Shift F; iOS hardware "
    "command-shift-F toggles that filter and is listed in Gestures & shortcuts; no new HTTP)"
)

ALL = "all"
UNREAD = "unread"


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "f":
        return True
    return characters.lower() == "f"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def toggled(mode):
    return ALL if mode == UNREAD else UNREAD


def includes(mode, has_dot):
    return mode != UNREAD or has_dot


def test_chord_and_toggle() -> None:
    assert is_chord("f", command=True, shift=True) is True
    assert is_chord("F", control=True, shift=True) is True
    assert is_chord("f", command=True, shift=True, characters="f") is True
    assert is_chord("f") is False
    assert is_chord("f", command=True) is False
    assert is_chord("F", command=True) is False
    assert is_chord("f", command=True, shift=True, option=True) is False
    assert is_chord("f", command=True, control=True, shift=True) is False
    assert is_chord("g", command=True, shift=True) is False
    assert is_chord("u", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert toggled(ALL) == UNREAD
    assert toggled(UNREAD) == ALL
    assert toggled(toggled(ALL)) == ALL
    rows = ["pinned", "open", "quiet"]
    dots = {"pinned"}
    unread = [row for row in rows if includes(toggled(ALL), row in dots)]
    assert unread == ["pinned"]
    assert includes(UNREAD, False) is False
    assert (UNREAD == "unread" and len(unread) == 1) is True
    assert 'static let keysLabel = "⌘⇧F"' in SWIFT
    assert 'static let action = "Toggle All / Unread"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "static func toggled" in FILTER
    assert "isChatListFilterChord" in DESKTOP
    assert "chatListFilterKeyBlocked" in DESKTOP
    assert "chatListFilterShouldToggle" in DESKTOP
    assert "nextChatListFilter" in (ROOT / "desktop" / "src" / "chatListFilter.ts").read_text(
        encoding="utf-8"
    )


def test_existing_toggle_path() -> None:
    start = CHAT.index("func chatListFilterKey")
    end = CHAT.index("func toggleChatListFilterFromComposer", start)
    key = CHAT[start:end]
    assert "ChatListFilterKey.isChord" in key
    assert "composerFocused" in key
    assert "chatListFilterKeyBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "toggleChatListFilterFromChord()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("toggleChatListFilterFromChord()")
    assert "hasRealAgent" not in key
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "toggleChatListFilterFromChord()" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    list_start = LIST.index("func chatListFilterKey")
    list_key = LIST[list_start : LIST.index("func jumpChatKey", list_start)]
    assert "ChatListFilterKey.isChord" in list_key
    assert "shouldIgnoreRepeat" in list_key
    assert "toggleChatListFilterFromChord()" in list_key
    assert "renamingID != nil" in list_key
    assert list_key.index("shouldIgnoreRepeat") < list_key.index(
        "toggleChatListFilterFromChord()"
    )
    commands = COMPOSER[
        COMPOSER.index("func chatListFilterCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "f"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func toggleChatListFilterFromShortcut") : COMPOSER.index(
            "func chatNavUp"
        )
    ]
    assert "markedTextRange != nil" in selector
    assert "chatListFilterConsumed" in selector
    assert "onToggleChatListFilter?()" in selector
    assert selector.index("if chatListFilterConsumed") < selector.index(
        "chatListFilterConsumed = true"
    )
    assert selector.index("chatListFilterConsumed = true") < selector.index(
        "onToggleChatListFilter?()"
    )
    assert "keyboardF" in COMPOSER
    assert "model.send(" not in commands
    assert "const onToggleChatListFilter" in APP
    assert "chooseChatListFilter(nextChatListFilter(chatListFilter))" in APP
    assert 'addEventListener("keydown", onToggleChatListFilter, true)' in APP
    assert "chatListFilterShouldToggle" in APP
    assert "func toggleChatListFilterFromChord" in MODEL
    assert "ChatListFilter.toggled(chatListFilter)" in MODEL
    assert "filterChordAt < 0.05" in MODEL
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "ChatListFilterKey.keysLabel" in SHEET
    assert "ChatListFilterKey.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.15 " in ROADMAP
    assert "## 115. v1.15" in SPEC
    assert "python3 ios/scripts/test_ios_chat_list_filter_key.py" in CI
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
