#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.88 Unread-only filter on the chat list.

A compact All / Unread control. All is the default and shows every
chat. Unread shows only chats that currently paint the v0.70 accent
dot (a reply-unread row, or a channel handoff unread that shares that
dot). An empty Unread list shows a muted No unread chats. Opening a
chat still clears its unread. The choice persists in UserDefaults.
Relative time, last-message preview, the unread count, and the dots
stay. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatListFilter.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatListFilter.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.88 Unread-only filter (a compact All / Unread control on the "
    "sidebar and the iOS chat list; All is the default and shows every "
    "chat; Unread shows only chats that currently carry the v0.70 unread "
    "accent dot; an empty Unread list shows a muted No unread chats; "
    "opening a chat still clears its unread; the choice persists in local "
    "storage / UserDefaults; relative time, last-message preview, the "
    "unread count outside the list, and the dots stay; no new HTTP)"
)

ALL = "all"
UNREAD = "unread"


def parse_filter(raw: str | None) -> str:
    return UNREAD if raw == UNREAD else ALL


def includes(mode: str, has_dot: bool) -> bool:
    return mode != UNREAD or has_dot


def show_empty(mode: str, unread_count: int) -> bool:
    return mode == UNREAD and unread_count == 0


def roster(rows: list[str], mode: str, dots: set[str]) -> list[str]:
    if mode != UNREAD:
        return list(rows)
    return [row for row in rows if row in dots]


def test_rules_match_desktop() -> None:
    rows = ["seed", "channel", "other"]
    assert parse_filter(None) == ALL
    assert parse_filter("") == ALL
    assert parse_filter("all") == ALL
    assert parse_filter("ALL") == ALL
    assert parse_filter("nope") == ALL
    assert parse_filter(UNREAD) == UNREAD
    assert roster(rows, ALL, {"other"}) == rows
    assert includes(ALL, False) is True
    assert show_empty(ALL, 0) is False

    dots = {"channel", "other"}
    assert roster(rows, UNREAD, dots) == ["channel", "other"]
    assert includes(UNREAD, True) is True
    assert includes(UNREAD, False) is False
    assert show_empty(UNREAD, 2) is False
    # Opening clears the dot, so the row leaves Unread.
    assert roster(rows, UNREAD, set()) == []
    assert show_empty(UNREAD, 0) is True
    assert roster(rows, ALL, set()) == rows

    assert 'static let storageKey = "snorlax.chatListFilter"' in SWIFT
    assert 'static let allLabel = "All"' in SWIFT
    assert 'static let unreadLabel = "Unread"' in SWIFT
    assert 'static let emptyLabel = "No unread chats"' in SWIFT
    assert 'static let groupLabel = "Chat list"' in SWIFT
    assert "raw == Mode.unread.rawValue ? .unread : .all" in SWIFT
    assert "filter != .unread || hasUnreadDot" in SWIFT
    assert "filter == .unread && unreadCount == 0" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert 'export const CHAT_LIST_FILTER_KEY = "snorlax.chatListFilter"' in DESKTOP
    assert 'export const UNREAD_EMPTY_LABEL = "No unread chats"' in DESKTOP
    assert "raw === FILTER_UNREAD ? FILTER_UNREAD : FILTER_ALL" in DESKTOP
    assert "if (filter !== FILTER_UNREAD) return true" in DESKTOP
    assert "filter === FILTER_UNREAD && unreadCount === 0" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_list_wires_filter_and_keeps_dots() -> None:
    assert "ChatListFilter.groupLabel" in LIST
    assert ".pickerStyle(.segmented)" in LIST
    assert "ChatListFilter.allLabel" in LIST
    assert "ChatListFilter.unreadLabel" in LIST
    assert "ChatListFilter.emptyLabel" in LIST
    assert "ChatListFilter.includes" in LIST
    assert "model.showsUnreadDot" in LIST
    assert "ChatListFilter.showEmpty" in LIST
    assert "ChatSwitcher.filter" in LIST
    assert "ChatSwitcher.emptyLabel" in LIST
    assert "model.chatPreviews[agent.id]" in LIST
    assert "ChatListTime.label(" in LIST
    assert 'accessibilityLabel("Unread")' in LIST
    assert "var chatListFilter: ChatListFilter.Mode" in MODEL
    assert "ChatListFilter.read()" in MODEL
    assert "ChatListFilter.write(chatListFilter)" in MODEL
    assert "clearReplyUnread(id)" in MODEL
    assert "replyUnreadIDs = chatUnread.snapshot" in MODEL
    assert "UnreadOutside.title" in (ROOT / "ios" / "SnorlaxBot" / "ContentView.swift").read_text(
        encoding="utf-8"
    )
    assert 'role="group"' in APP
    assert "chooseChatListFilter(FILTER_UNREAD)" in APP
    assert 'className="roster-empty"' in APP
    assert 'className="unread-dot" aria-label="Unread"' in APP
    assert 'className="row-preview"' in APP
    assert 'className="row-time"' in APP
    assert "clearReplyUnread(id)" in APP
    assert "agents.map((agent) => ({ id: agent.id, name: agent.name }))" in APP
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.88 " in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_list_filter.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_list_wires_filter_and_keeps_dots,
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
