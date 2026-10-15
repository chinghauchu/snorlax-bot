#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.10 mark the open chat unread from the keyboard.

Hardware command-shift-U or control-shift-U marks the open chat
through the same toggleChatRead path as the chat-list Mark as unread
action. A read chat joins the existing unread set, so the accent dot,
the count outside the list, and the Unread filter all see it. A chat
that already shows the dot is marked read, matching that menu item.
A muted chat follows the menu and does not paint a dot or change the
count. Opening the chat still clears the dot. The composer does not
own the chord and does not insert the letter. IME and any other text
field do. A key repeat does not flap the mark. Nothing changes when
no chat is open. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkOpenChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
UNREAD = (IOS / "ChatUnread.swift").read_text(encoding="utf-8")
MUTES = (IOS / "ChatMute.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markOpenChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.10 mark the open chat unread from the keyboard (Cmd/Ctrl-Shift-U marks "
    "the currently open chat unread through the same local-state path as the "
    "v0.90 sidebar Mark as unread action; a read chat paints that same accent "
    "unread dot, counts toward the unread count outside the chat list, and shows "
    "under the Unread filter; opening the chat again clears it; the same sidebar "
    "control marks a chat read when it already shows the dot, so the chord does "
    "that too and a key repeat does not flap; a muted chat follows the sidebar "
    "and does not pick up a dot or an unread count from this mark or from a new "
    "reply; the chord still works from the composer and does not insert text; "
    "IME composition keeps the key; find, the quick switcher, the shortcuts "
    "list, rename, the lightbox, a modal or overlay text field, and a focused "
    "widget, approve, or connect card keep the key; nothing changes when no chat "
    "is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, "
    "Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, "
    "Cmd/Ctrl-Shift-M, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, "
    "Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list "
    "includes Cmd/Ctrl Shift U; iOS hardware command-shift-U marks the open chat "
    "the same way and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "u":
        return True
    return characters.lower() == "u"


def should_ignore_repeat(is_repeat):
    return is_repeat


def paints(muted, would):
    return False if muted else would


def may_mark(muted):
    return not muted


def audible(ids, muted):
    hidden = set(muted)
    return {row for row in ids if row and row not in hidden}


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_repeat_and_mark() -> None:
    assert is_chord("u", command=True, shift=True) is True
    assert is_chord("U", control=True, shift=True) is True
    assert is_chord("u", command=True, shift=True, characters="u") is True
    assert is_chord("u") is False
    assert is_chord("u", command=True) is False
    assert is_chord("u", command=True, shift=True, option=True) is False
    assert is_chord("u", command=True, control=True, shift=True) is False
    assert is_chord("m", command=True, shift=True) is False
    assert is_chord("p", command=True, shift=True) is False
    assert is_chord("n", command=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    stored = set()
    assert may_mark(False) is True
    stored.add("open")
    assert paints(False, "open" in stored) is True
    assert audible(stored, []) == {"open"}
    assert may_mark(True) is False
    assert paints(True, True) is False
    assert audible({"open"}, ["open"]) == set()
    stored.discard("open")
    assert "open" not in stored
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧U"' in SWIFT
    assert 'static let action = "Mark as unread or read"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isMarkOpenChatChord" in DESKTOP
    assert "markOpenChatBlocked" in DESKTOP
    assert "markOpenChatShouldApply" in DESKTOP
    assert "overlayTextFieldOwnsMarkOpenChat" in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "func mark(_ chatId: String)" in UNREAD
    assert "func clear(_ chatId: String)" in UNREAD
    assert "func replyMayMarkUnread(muted: Bool)" in MUTES
    assert "func paintsUnreadAccent(muted: Bool, wouldPaint: Bool)" in MUTES


def test_existing_mark_path() -> None:
    start = CHAT.index("func markOpenChatKey")
    end = CHAT.index("func markOpenChatFromComposer", start)
    key = CHAT[start:end]
    assert "MarkOpenChat.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "findOpen" in key
    assert "shortcutsOpen" in key
    assert "lightbox != nil" in key
    assert "shouldIgnoreRepeat" in key
    assert "model.toggleChatRead(agent.id)" in key
    assert key.index("shouldIgnoreRepeat") < key.index("model.toggleChatRead")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "model.toggleChatRead(agent.id)" in follow
    assert "hasRealAgent" in follow
    assert "model.send(" not in follow
    read = MODEL[
        MODEL.index("func toggleChatRead(_ id: String)") : MODEL.index("func retainChatPins")
    ]
    assert "chatUnread.mark(id)" in read
    assert "chatUnread.clear(id)" in read
    assert "unreadChannelIDs.remove(id)" in read
    assert "ChatMute.replyMayMarkUnread" in read
    assert "publishReplyUnread()" in read
    assert read.index("replyMayMarkUnread") < read.index("chatUnread.mark")
    assert "clearReplyUnread(id)" in MODEL
    assert "model.toggleChatRead(agent.id)" in LIST
    commands = COMPOSER[
        COMPOSER.index("func markOpenChatCommands") : COMPOSER.index("func clearComposerDraftCommands")
    ]
    assert 'input: "u"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func markOpenChatFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "markOpenChatConsumed" in selector
    assert "onMarkOpenChat?()" in selector
    assert selector.index("if markOpenChatConsumed") < selector.index("markOpenChatConsumed = true")
    assert selector.index("markOpenChatConsumed = true") < selector.index("onMarkOpenChat?()")
    assert "keyboardU" in COMPOSER
    assert "model.send(" not in commands
    assert "const onMarkOpenChat" in APP
    assert "onToggleRead(id)" in APP
    assert 'addEventListener("keydown", onMarkOpenChat, true)' in APP
    assert "markOpenChatShouldApply" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "MarkOpenChat.keysLabel" in SHEET
    assert "MarkOpenChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.10 " in ROADMAP
    assert "## 110. v1.10" in SPEC
    assert "python3 ios/scripts/test_ios_mark_open_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_repeat_and_mark,
        test_existing_mark_path,
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
