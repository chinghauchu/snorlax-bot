#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.70 unread dot on a sidebar chat row.

A non-empty assistant reply that finishes while that chat is not on
screen, or while the app/window is not focused, marks the row. Opening
the chat clears it. Becoming focused while that chat is already on
screen clears it too. Desktop localStorage and iOS UserDefaults keep
the set across relaunch. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
UNREAD = (IOS / "ChatUnread.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
CONTENT = (IOS / "ContentView.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_UNREAD = (ROOT / "desktop" / "src" / "chatUnread.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.70 unread chat dot (a 6px accent dot on a sidebar row when an "
    "assistant reply finishes in a chat that is not open, or while the "
    "app/window is not focused; opening that chat clears it; desktop "
    "local storage; iOS UserDefaults; no new HTTP)"
)
STORAGE_KEY = "snorlax.chatUnread"


def _fn(src: str, name: str) -> str:
    markers = (
        f"func {name}",
        f"private func {name}",
    )
    start = -1
    used = ""
    for marker in markers:
        idx = src.find(marker)
        if idx >= 0:
            start = idx
            used = marker
            break
    if start < 0:
        raise AssertionError(f"missing {name}")
    nxt = src.find("\n    func ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    private func ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def reply_marks_unread(chat_id: str, open_chat_id: str | None, focused: bool) -> bool:
    if not chat_id:
        return False
    if not focused:
        return True
    return chat_id != open_chat_id


def is_finished(from_user: bool, kind_message: bool, has_token: bool) -> bool:
    return (not from_user) and kind_message and has_token


def on_screen(pad: bool, selected: str | None, navigation_last: str | None) -> str | None:
    return selected if pad else navigation_last


def parse_unread(raw: str | None) -> set[str]:
    if not raw:
        return set()
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return set()
    if not isinstance(obj, list):
        return set()
    return {item for item in obj if isinstance(item, str) and item}


def dump_unread(ids: set[str]) -> str:
    return json.dumps(sorted(item for item in ids if item), separators=(",", ":"))


class Unread:
    """Same rules as ChatUnread.swift / chatUnread.ts, including relaunch."""

    def __init__(self, raw: str | None = None) -> None:
        self.ids = parse_unread(raw)

    def mark(self, chat_id: str) -> bool:
        if not chat_id or chat_id in self.ids:
            return False
        self.ids.add(chat_id)
        return True

    def clear(self, chat_id: str) -> bool:
        if chat_id not in self.ids:
            return False
        self.ids.remove(chat_id)
        return True

    def retain(self, keep: set[str]) -> bool:
        nxt = self.ids & keep
        if nxt == self.ids:
            return False
        self.ids = nxt
        return True

    def relaunch(self) -> "Unread":
        return Unread(dump_unread(self.ids))


def test_mark_when_not_open_or_not_focused() -> None:
    assert reply_marks_unread("agent-a", "agent-b", True)
    assert not reply_marks_unread("agent-a", "agent-a", True)
    assert reply_marks_unread("agent-a", "agent-a", False)
    assert reply_marks_unread("agent-a", None, True)
    assert not reply_marks_unread("", None, False)
    assert is_finished(False, True, True)
    assert is_finished(False, True, True)
    assert not is_finished(True, True, True)
    assert not is_finished(False, False, True)
    assert not is_finished(False, True, False)
    assert on_screen(False, "agent-a", None) is None
    assert on_screen(False, "agent-a", "agent-a") == "agent-a"
    assert on_screen(True, "agent-b", None) == "agent-b"


def test_persist_open_clears_and_deleted_drops() -> None:
    unread = Unread()
    assert unread.mark("agent-a")
    assert not unread.mark("agent-a")
    assert unread.mark("agent-b")
    revived = unread.relaunch()
    assert revived.ids == {"agent-a", "agent-b"}
    assert revived.clear("agent-a")
    assert not revived.clear("agent-a")
    assert revived.relaunch().ids == {"agent-b"}
    assert not revived.retain({"agent-b"})
    assert revived.retain(set())
    assert revived.relaunch().ids == set()
    assert parse_unread("{") == set()
    assert parse_unread("{}") == set()
    assert parse_unread(json.dumps(["", 1, "agent-a"])) == {"agent-a"}
    assert STORAGE_KEY == "snorlax.chatUnread"


def test_ios_wires_done_open_focus_and_row() -> None:
    assert "private var chatUnread = ChatUnread()" in MODEL
    assert "replyUnreadIDs = chatUnread.snapshot" in MODEL
    assert "clearReplyUnread(id)" in MODEL
    load = _fn(MODEL, "loadConversation(")
    assert "clearReplyUnread(id)" in load
    assert load.index("selectedAgentID = id") < load.index("clearReplyUnread(id)")

    handle = _fn(MODEL, "handle(")
    assert "noteFinishedAssistantReply(chatId: agentId, message: message)" in handle
    assert handle.index("noteFinishedAssistantReply") < handle.index(
        "guard selectedAgentID == agentId"
    )
    note = _fn(MODEL, "noteFinishedAssistantReply(")
    assert "ChatUnread.isFinishedAssistantReply" in note
    assert "ChatUnread.replyMarksUnread" in note
    assert "onScreenChatID()" in note
    assert "sceneFocused" in note

    focus = _fn(MODEL, "setSceneFocused(")
    assert "clearReplyUnread(id)" in focus
    assert "showsUnreadDot" in MODEL
    assert "model.showsUnreadDot(agent)" in LIST
    assert 'accessibilityLabel("Unread")' in LIST
    assert "model.setSceneFocused(scenePhase == .active)" in CONTENT
    assert "visibilitychange" not in MODEL
    assert "streamChatId" in DESKTOP_APP
    assert "noteReplyUnread(streamChatId)" in DESKTOP_APP
    assert "clearReplyUnread(id)" in DESKTOP_APP
    assert "windowIsFocused(document)" in DESKTOP_APP


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert f'static let storageKey = "{STORAGE_KEY}"' in UNREAD
    assert "UserDefaults" in UNREAD
    assert "JSONSerialization" in UNREAD
    assert "CHAT_UNREAD_KEY" in DESKTOP_UNREAD
    assert "localStorage" in DESKTOP_UNREAD
    assert "python3 ios/scripts/test_ios_chat_unread.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in UNREAD
    assert "computerPane.ts" not in MODEL
    assert "/v1/" not in UNREAD
    assert "/v1/" not in DESKTOP_UNREAD


def main() -> int:
    tests = [
        test_mark_when_not_open_or_not_focused,
        test_persist_open_clears_and_deleted_drops,
        test_ios_wires_done_open_focus_and_row,
        test_openapi_roadmap_ci_no_computer_pane,
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
    raise SystemExit(main())
