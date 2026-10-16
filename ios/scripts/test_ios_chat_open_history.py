#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.23 keyboard back and forward between recently opened chats.

Hardware command-[ or control-[ steps back through this window's
in-memory chat-open history. command-] or control-] steps forward.
Opening a chat pushes. Going back and then opening a different chat
truncates the forward entries. Deleted chats are skipped. Archived
chats stay valid. Either end is a no-op. The composer does not own
the chord and does not insert the bracket. A key repeat does not step
again. IME and any other text field do. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ChatOpenHistory.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatOpenHistory.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.23 keyboard back and forward between recently opened chats (Cmd/Ctrl-[ opens "
    "the previously opened chat and Cmd/Ctrl-] opens the next one again, using a small "
    "in-memory per-window history of chat opens; opening a chat from the sidebar, the "
    "quick switcher, Cmd/Ctrl-1..9, next or previous unread, Alt+Up/Down, and the other "
    "open paths pushes onto that history; going back and then opening a new chat truncates "
    "the forward history; deleted chats are skipped; archived chats stay valid targets; "
    "either end is a no-op; the chord still works from the composer and does not insert "
    "text; a key repeat does not move again and does not insert; IME composition keeps the "
    "key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal "
    "or overlay text field, and a focused widget, approve, or connect card keep the key; "
    "Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, "
    "Cmd/Ctrl-Shift-B, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, "
    "Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, "
    "Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, "
    "Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, "
    "Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow "
    "recall stay; the shortcuts list includes Cmd/Ctrl [ / ]; iOS hardware command-[ and "
    "command-] (and the control variants) move through that history and are listed in "
    "Gestures & shortcuts; no new HTTP)"
)


def direction(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or shift:
        return None
    if command == control:
        return None
    token = str(key)
    if token == "[" or characters == "[":
        return "back"
    if token == "]" or characters == "]":
        return "forward"
    return None


def record(state, chat_id):
    ids, index = state
    nxt = (chat_id or "").strip()
    if not nxt:
        return (list(ids), index)
    if 0 <= index < len(ids) and ids[index] == nxt:
        return (list(ids), index)
    if index == len(ids) and index > 0 and ids[index - 1] == nxt:
        return (list(ids), index - 1)
    keep = 0 if index < 0 else min(index + 1, len(ids))
    kept = list(ids[:keep])
    kept.append(nxt)
    return (kept, len(kept) - 1)


def note_closed(state):
    ids, index = state
    if not ids or index < 0 or index >= len(ids):
        return (list(ids), index)
    return (list(ids), index + 1)


def step(state, way, alive):
    ids, index = state
    if not ids or index < 0:
        return (list(ids), index), None
    delta = -1 if way == "back" else 1
    cursor = index + delta
    while 0 <= cursor < len(ids):
        if ids[cursor] in alive:
            return (list(ids), cursor), ids[cursor]
        cursor += delta
    return (list(ids), index), None


def test_history_and_chord() -> None:
    assert direction("[", command=True) == "back"
    assert direction("]", control=True) == "forward"
    assert direction("[", command=True, characters="[") == "back"
    assert direction("]") is None
    assert direction("[", command=True, shift=True) is None
    assert direction("[", command=True, option=True) is None
    assert direction("[", command=True, control=True) is None
    assert direction("b", command=True, shift=True) is None
    state = record(([], -1), "a")
    state = record(state, "b")
    state = record(state, "c")
    assert state == (["a", "b", "c"], 2)
    state = record(state, "c")
    assert state == (["a", "b", "c"], 2)
    stepped, chat_id = step(state, "back", {"a", "b", "c"})
    assert chat_id == "b"
    branched = record(stepped, "d")
    assert branched == (["a", "b", "d"], 2)
    skipped, chat_id = step((["a", "b", "c"], 2), "back", {"a", "c"})
    assert chat_id == "a" and skipped[1] == 0
    forward, chat_id = step(skipped, "forward", {"a", "c"})
    assert chat_id == "c" and forward[1] == 2
    parked = note_closed((["a", "b"], 1))
    assert parked[1] == 2
    back, chat_id = step(parked, "back", {"a", "b"})
    assert chat_id == "b"
    assert record(parked, "b") == (["a", "b"], 1)
    assert step((["c"], 0), "back", {"c"})[1] is None
    assert step((["c"], 0), "forward", {"c"})[1] is None
    assert 'static let keysLabel = "⌘[ / ⌘]"' in SWIFT
    assert 'static let action = "Back or forward chat"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "noteClosed" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "chatHistoryDirection" in DESKTOP
    assert "chatHistoryBlocked" in DESKTOP
    assert "recordChatOpen" in DESKTOP
    assert "No HTTP" in DESKTOP


def test_existing_open_path() -> None:
    start = CHAT.index("func chatHistoryKey")
    end = CHAT.index("func chatHistoryFromComposer", start)
    key = CHAT[start:end]
    assert "ChatOpenHistory.direction" in key
    assert "composerFocused" in key
    assert "chatHistoryBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "model.openChatFromHistory" in key
    assert key.index("shouldIgnoreRepeat") < key.index("model.openChatFromHistory")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatHistoryBlocked", end)]
    assert "model.openChatFromHistory" in follow
    assert "model.send(" not in follow
    blocked = CHAT[
        CHAT.index("func chatHistoryBlocked") : CHAT.index("func unarchiveOpenChatBlocked")
    ]
    assert "findOpen" in blocked
    assert "shortcutsOpen" in blocked
    assert "lightbox != nil" in blocked
    assert "renameChatID != nil" in blocked
    assert "func openChatFromHistory" in MODEL
    opener = MODEL[
        MODEL.index("func openChatFromHistory") : MODEL.index("func unarchiveChat")
    ]
    assert "recordHistory: false" in opener
    assert "ChatOpenHistory.record" not in opener
    assert "visibleAgents.map" in opener
    assert "wantsComposerFocus = true" in opener
    load = MODEL[
        MODEL.index("func loadConversation(") : MODEL.index("readingPublishLocked = true", MODEL.index("func loadConversation("))
    ]
    assert "recordHistory" in load
    assert "ChatOpenHistory.record" in load
    assert "ChatOpenHistory.noteClosed" in MODEL
    assert "model.openChatFromHistory" in LIST
    commands = COMPOSER[
        COMPOSER.index("func chatHistoryCommands") : COMPOSER.index("func chatHistoryFromShortcut")
    ]
    assert 'input: "["' in commands
    assert 'input: "]"' in commands
    assert "modifierFlags: .command" in commands
    assert "modifierFlags: .control" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func chatHistoryFromShortcut") : COMPOSER.index(
            "func unarchiveOpenChatCommands"
        )
    ]
    assert "markedTextRange != nil" in selector
    assert "chatHistoryBackConsumed" in selector
    assert "chatHistoryForwardConsumed" in selector
    assert 'onChatHistory?("back")' in selector
    assert 'onChatHistory?("forward")' in selector
    assert selector.index("if chatHistoryBackConsumed") < selector.index('onChatHistory?("back")')
    assert "keyboardOpenBracket" in COMPOSER
    assert "keyboardCloseBracket" in COMPOSER
    handler = APP[
        APP.index("const onChatHistory") : APP.index(
            'addEventListener("keydown", onChatHistory, true)'
        )
    ]
    assert "chatHistoryBlocked" in handler
    assert "preventDefault" in handler
    assert handler.index("preventDefault") < handler.index("chatHistoryShouldMove")
    assert "recordChatOpen" not in handler
    assert '"restore"' in APP
    assert "ChatOpenHistory.keysLabel" in SHEET
    assert "ChatOpenHistory.action" in SHEET
    assert "Gestures & shortcuts" in SHEET
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.23 " in ROADMAP
    assert "## 123. v1.23" in SPEC
    assert "python3 ios/scripts/test_ios_chat_open_history.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_history_and_chord,
        test_existing_open_path,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
