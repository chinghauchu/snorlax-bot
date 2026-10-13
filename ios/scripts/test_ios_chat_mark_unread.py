#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.90 mark a chat unread from the chat list.

A read row offers Mark as unread. A row that shows the v0.70 unread
dot offers Mark as read. Mark as unread writes the existing persisted
reply-unread set, so the accent dot, the count outside the list, and
the Unread filter all follow. Mark as read clears that set and a
channel handoff dot. Opening the chat still clears it. A trailing
swipe and a long-press offer the action. Pins stay. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
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
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatUnread.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.90 mark a chat unread (right-click a sidebar chat row offers "
    "Mark as unread on a read chat and Mark as read on one that shows "
    "the v0.70 unread dot; marking unread paints that same accent dot, "
    "counts toward the unread count outside the chat list, and shows "
    "the chat under the Unread filter; opening the chat clears it; the "
    "mark uses the existing unread persistence; iOS trailing swipe and "
    "long-press offer the same action; pinned rows stay pinned; no new HTTP)"
)
STORAGE_KEY = "snorlax.chatUnread"


def action_label(shows_dot: bool) -> str:
    return "Mark as read" if shows_dot else "Mark as unread"


def shows_dot(
    chat_id: str,
    reply: set[str],
    handoff: set[str],
    channel: bool = False,
) -> bool:
    if not chat_id:
        return False
    if channel and chat_id in handoff:
        return True
    return chat_id in reply


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

    def clear(self, chat_id: str) -> bool:
        if chat_id not in self.ids:
            return False
        self.ids.remove(chat_id)
        self.raw = dump_unread(self.ids)
        return True

    def relaunch(self) -> "Unread":
        revived = Unread()
        revived.raw = self.raw
        revived.ids = parse_unread(self.raw)
        return revived


def test_label_follows_the_dot() -> None:
    assert action_label(False) == "Mark as unread"
    assert action_label(True) == "Mark as read"
    assert shows_dot("", {"a"}, {"a"}) is False
    assert shows_dot("seed", set(), set()) is False
    assert shows_dot("seed", {"seed"}, set()) is True
    assert shows_dot("channel", set(), {"channel"}, channel=True) is True
    assert shows_dot("channel", set(), {"channel"}, channel=False) is False
    assert action_label(shows_dot("seed", set(), set())) == "Mark as unread"
    assert action_label(shows_dot("seed", {"seed"}, set())) == "Mark as read"
    assert (
        action_label(shows_dot("channel", set(), {"channel"}, channel=True))
        == "Mark as read"
    )


def test_mark_persists_counts_and_opening_clears() -> None:
    unread = Unread()
    assert unread.mark("other")
    assert not unread.mark("other")
    revived = unread.relaunch()
    assert revived.ids == {"other"}
    assert len(revived.ids) == 1
    pins = ["other", "seed"]
    unread_rows = [row for row in ["seed", "channel", "other", "late"] if row in revived.ids]
    pinned = [row for row in pins if row in unread_rows]
    assert pinned == ["other"]
    assert pins == ["other", "seed"]
    assert revived.clear("other")
    assert revived.ids == set()
    assert revived.relaunch().ids == set()


def test_list_wires_mark_and_keeps_pin() -> None:
    assert 'static let markUnreadLabel = "Mark as unread"' in SWIFT
    assert 'static let markReadLabel = "Mark as read"' in SWIFT
    assert "showsDot ? markReadLabel : markUnreadLabel" in SWIFT
    assert f'static let storageKey = "{STORAGE_KEY}"' in SWIFT
    assert "if channel, handoffUnread.contains(chatId)" in SWIFT
    assert "No new storage key" in SWIFT
    assert "/v1/" not in SWIFT
    assert 'export const MARK_UNREAD_LABEL = "Mark as unread"' in DESKTOP
    assert 'export const MARK_READ_LABEL = "Mark as read"' in DESKTOP
    assert "return showsDot ? MARK_READ_LABEL : MARK_UNREAD_LABEL" in DESKTOP
    assert 'export const CHAT_UNREAD_KEY = "snorlax.chatUnread"' in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "ChatUnread.actionLabel(showsDot: model.showsUnreadDot(agent))" in LIST
    assert "swipeActions(edge: .trailing" in LIST
    assert "model.toggleChatRead(agent.id)" in LIST
    assert 'systemImage: "envelope.badge"' in LIST
    assert "Button(ChatUnread.actionLabel(showsDot: unread), action: onRead)" in LIST
    assert "ChatPins.label(pinned: model.isChatPinned(agent.id))" in LIST
    assert "swipeActions(edge: .leading" in LIST
    assert "func toggleChatRead(_ id: String)" in MODEL
    assert "chatUnread.mark(id)" in MODEL
    assert "chatUnread.clear(id)" in MODEL
    assert "unreadChannelIDs.remove(id)" in MODEL
    assert "publishReplyUnread()" in MODEL
    assert "clearReplyUnread(id)" in MODEL
    assert "func toggleChatPin(_ id: String)" in MODEL
    assert "onToggleRead(contextMenu.agent.id)" in APP
    assert "chatUnread.current.mark(id)" in APP
    assert "chatUnread.current.clear(id)" in APP
    assert "pinActionLabel(isChatPinned(pinnedChatIds, contextMenu.agent.id))" in APP
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.90 " in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_mark_unread.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_label_follows_the_dot,
        test_mark_persists_counts_and_opening_clears,
        test_list_wires_mark_and_keeps_pin,
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
