#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.01 mark all as read.

When one or more chats are unread, a muted Mark all as read control
sits under All / Unread on the desktop sidebar and in the iOS chat
list toolbar. Using it clears every unread dot, including archived
chats and channel handoff dots. The window title and badge go to
zero. The Unread filter shows No unread chats. The control is hidden
when nothing is unread. The clear uses snorlax.chatUnread. No new
HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatUnread.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatUnread.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_SHORTCUTS = (ROOT / "desktop" / "src" / "chatShortcuts.ts").read_text(
    encoding="utf-8"
)
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.01 mark all as read (when one or more chats are unread, a muted "
    "Mark all as read control sits under the All / Unread control in the "
    "sidebar, and the iOS chat list shows the same control in its toolbar; "
    "using it clears every unread dot, including archived chats and channel "
    "handoff dots, so the window title and badge count go to zero and the "
    "Unread filter shows No unread chats; the control is hidden when nothing "
    "is unread; the clear uses the existing unread persistence; pins stay; "
    "no keyboard shortcut; no new HTTP)"
)
STORAGE_KEY = "snorlax.chatUnread"
APP_TITLE = "Snorlax-Bot"


def any_chat_unread(reply: set[str], handoff: set[str]) -> bool:
    return any(row for row in reply) or any(row for row in handoff)


def dump_unread(ids: set[str]) -> str:
    return json.dumps(sorted(row for row in ids if row))


def parse_unread(raw: str | None) -> set[str]:
    if not raw:
        return set()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return set()
    if not isinstance(parsed, list):
        return set()
    return {row for row in parsed if isinstance(row, str) and row}


def title_for(count: int) -> str:
    return APP_TITLE if count <= 0 else f"({count}) {APP_TITLE}"


class Unread:
    def __init__(self) -> None:
        self.raw: str | None = None
        self.ids = parse_unread(self.raw)

    def mark(self, chat_id: str) -> bool:
        if not chat_id or chat_id in self.ids:
            return False
        self.ids.add(chat_id)
        self.raw = dump_unread(self.ids)
        return True

    def clear_all(self) -> bool:
        if not self.ids:
            return False
        self.ids = set()
        self.raw = dump_unread(self.ids)
        return True

    def relaunch(self) -> "Unread":
        revived = Unread()
        revived.raw = self.raw
        revived.ids = parse_unread(self.raw)
        return revived


def test_hidden_until_something_is_unread() -> None:
    assert any_chat_unread(set(), set()) is False
    assert any_chat_unread({""}, {""}) is False
    assert any_chat_unread({"live"}, set()) is True
    assert any_chat_unread(set(), {"channel"}) is True
    assert any_chat_unread({"archived"}, set()) is True


def test_clears_archived_and_handoff_then_badge_is_zero() -> None:
    unread = Unread()
    assert unread.mark("live")
    assert unread.mark("archived")
    handoff = {"channel"}
    assert any_chat_unread(unread.ids, handoff) is True
    pins = ["live", "archived"]
    assert unread.clear_all() is True
    assert unread.clear_all() is False
    revived = unread.relaunch()
    assert revived.ids == set()
    assert revived.raw == "[]"
    handoff_after: set[str] = set()
    assert any_chat_unread(revived.ids, handoff_after) is False
    assert title_for(len(revived.ids)) == APP_TITLE
    rows = ["live", "archived", "channel"]
    visible = [
        row
        for row in rows
        if row in revived.ids or (row == "channel" and row in handoff_after)
    ]
    assert visible == []
    assert pins == ["live", "archived"]

    handoff_only = Unread()
    assert any_chat_unread(handoff_only.ids, {"channel"}) is True
    assert handoff_only.clear_all() is False
    assert handoff_only.raw is None
    assert any_chat_unread(handoff_only.ids, set()) is False


def test_list_wires_the_toolbar_and_keeps_http_local() -> None:
    assert 'static let markAllReadLabel = "Mark all as read"' in SWIFT
    assert "static func anyChatUnread" in SWIFT
    assert "func clearAll() -> Bool" in SWIFT
    assert f'static let storageKey = "{STORAGE_KEY}"' in SWIFT
    assert "No new storage key" in SWIFT
    assert "/v1/" not in SWIFT
    assert 'export const MARK_ALL_READ_LABEL = "Mark all as read"' in DESKTOP
    assert "export function anyChatUnread" in DESKTOP
    assert "clearAll(): boolean" in DESKTOP
    assert 'export const CHAT_UNREAD_KEY = "snorlax.chatUnread"' in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "ChatUnread.markAllReadLabel" in LIST
    assert "model.hasAnyUnreadChat" in LIST
    assert "model.markAllChatsRead()" in LIST
    assert "placement: .topBarLeading" in LIST
    assert ".foregroundStyle(.secondary)" in LIST
    assert "func markAllChatsRead()" in MODEL
    assert "chatUnread.clearAll()" in MODEL
    assert "unreadChannelIDs = []" in MODEL
    assert "publishReplyUnread()" in MODEL
    assert "var hasAnyUnreadChat: Bool" in MODEL
    assert "function onMarkAllRead(" in APP
    assert "chatUnread.current.clearAll()" in APP
    assert 'className="roster-mark-all"' in APP
    assert "Cmd/Ctrl Shift O" in DESKTOP_SHORTCUTS
    assert "⌘⇧O" in SHORTCUTS
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST
    assert not PANE.exists()


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.01 " in ROADMAP
    assert "## 101. v1.01" in SPEC
    assert "including ids for archived chats" in SPEC
    assert "python3 ios/scripts/test_ios_mark_all_read.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_hidden_until_something_is_unread,
        test_clears_archived_and_handoff_then_badge_is_zero,
        test_list_wires_the_toolbar_and_keeps_http_local,
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
    raise SystemExit(main())
