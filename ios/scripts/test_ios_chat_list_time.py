#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.83 sidebar relative time.

A compact time sits beside each chat's last-message preview, from that
chat's latest message already in memory. now, 5m, 3h, Yesterday, the
weekday name within the past week, then a short date like Oct 3. A light
timer refreshes it. A new message updates it. Empty chats show no time.
The iOS chat list matches. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatListTime.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatListTime.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.83 sidebar relative time (a compact time beside each chat's "
    "last-message preview, from that chat's latest message already in "
    "memory; now, 5m, 3h, Yesterday, the weekday name within the past week, "
    "then a short date like Oct 3; a light timer refreshes it as time "
    "passes; a new message updates it; empty chats show no time; the iOS "
    "chat list matches; no new HTTP)"
)

MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)
WEEKDAYS = (
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
)


def chat_list_time(created: datetime | None, now: datetime) -> str | None:
    """Same rules as ChatListTime.swift / chatListTime.ts. Local calendar."""
    if created is None:
        return None
    elapsed = (now - created).total_seconds()
    days = (now.date() - created.date()).days
    if elapsed < 60 or days < 0:
        return "now"
    if days == 0:
        minutes = int(elapsed // 60)
        if minutes < 60:
            return f"{minutes}m"
        hours = int(elapsed // 3600)
        return f"{max(hours, 1)}h"
    if days == 1:
        return "Yesterday"
    if 2 <= days <= 6:
        return WEEKDAYS[(created.weekday() + 1) % 7]
    label = f"{MONTHS[created.month - 1]} {created.day}"
    if created.year != now.year:
        return f"{label}, {created.year}"
    return label


def test_labels_match_desktop_rules() -> None:
    now = datetime(2026, 10, 9, 16, 0, 0)
    assert chat_list_time(datetime(2026, 10, 9, 15, 59, 30), now) == "now"
    assert chat_list_time(datetime(2026, 10, 9, 16, 0, 20), now) == "now"
    assert chat_list_time(datetime(2026, 10, 9, 15, 59, 0), now) == "1m"
    assert chat_list_time(datetime(2026, 10, 9, 15, 55, 0), now) == "5m"
    assert chat_list_time(datetime(2026, 10, 9, 15, 0, 1), now) == "59m"
    assert chat_list_time(datetime(2026, 10, 9, 15, 0, 0), now) == "1h"
    assert chat_list_time(datetime(2026, 10, 9, 13, 0, 0), now) == "3h"
    assert chat_list_time(datetime(2026, 10, 9, 0, 0, 0), now) == "16h"
    early = datetime(2026, 10, 9, 1, 0, 0)
    assert chat_list_time(datetime(2026, 10, 8, 23, 0, 0), early) == "Yesterday"
    assert chat_list_time(datetime(2026, 10, 8, 23, 59), now) == "Yesterday"
    assert chat_list_time(datetime(2026, 10, 7, 12, 0), now) == "Wednesday"
    assert chat_list_time(datetime(2026, 10, 3, 8, 0), now) == "Saturday"
    assert chat_list_time(datetime(2026, 10, 2, 8, 0), now) == "Oct 2"
    assert chat_list_time(datetime(2026, 1, 1, 8, 1), now) == "Jan 1"
    assert chat_list_time(datetime(2025, 10, 3, 8, 0), now) == "Oct 3, 2025"
    assert chat_list_time(datetime(2026, 10, 10, 1, 0), now) == "now"
    assert chat_list_time(None, now) is None
    # A new message moves 4h to 5m without waiting on the timer.
    assert chat_list_time(now - timedelta(hours=4), now) == "4h"
    assert chat_list_time(now - timedelta(minutes=5), now) == "5m"

    assert 'static let nowLabel = "now"' in SWIFT
    assert 'static let yesterdayLabel = "Yesterday"' in SWIFT
    assert "static let tickSeconds: TimeInterval = 30" in SWIFT
    assert "elapsed < 60 || days < 0" in SWIFT
    assert "days == 0" in SWIFT
    assert "days == 1" in SWIFT
    assert "(2...6).contains(days)" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'CHAT_LIST_NOW = "now"' in DESKTOP
    assert 'CHAT_LIST_YESTERDAY = "Yesterday"' in DESKTOP
    assert "CHAT_LIST_TIME_TICK_MS = 30_000" in DESKTOP
    assert "elapsed < MINUTE_MS || days < 0" in DESKTOP
    assert "if (days === 0)" in DESKTOP
    assert "if (days === 1)" in DESKTOP
    assert "days >= 2 && days <= 6" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    for name in MONTHS:
        assert f'"{name}"' in SWIFT
        assert f'"{name}"' in DESKTOP
    for name in WEEKDAYS:
        assert f'"{name}"' in SWIFT
        assert f'"{name}"' in DESKTOP


def test_list_places_time_on_the_preview_row() -> None:
    assert "ChatListTime.label(" in LIST
    assert "ChatListTime.tickSeconds" in LIST
    assert "TimelineView(.periodic" in LIST
    assert "chatActivity[agentId]" in LIST
    assert "model.chatPreviews[agent.id]" in LIST
    assert "lineLimit(1)" in LIST
    assert "truncationMode(.tail)" in LIST
    assert "minHeight: 44" in LIST
    row = LIST.split("private struct AgentRow", 1)[1].split("struct AccountChip", 1)[0]
    assert "chatPreviews" in row
    assert "chatMeta" in row
    assert "rosterSubtitle" in row
    assert "storeChatActivity(" in MODEL
    assert "noteFinishedActivity(" in MODEL
    assert "messages.last?.createdAt" in MODEL
    assert "chatActivity = chatActivity.filter" in MODEL
    assert "noteChatPreview()" in MODEL
    assert 'className="row-time"' in APP
    assert 'className="row-meta"' in APP
    assert "chatListTimeLabel(" in APP
    assert "rememberChatActivity(" in APP
    assert "applyFinishedActivity(" in APP
    assert "CHAT_LIST_TIME_TICK_MS" in APP
    assert "window.setInterval" in APP


def test_openapi_stays_0180() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in DESKTOP_OPENAPI
    assert not PANE.exists()
    assert "computerPane.ts" not in LIST
    assert PHRASE in ROADMAP
    assert "/ v0.83 " in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_list_time.py" in CI


def main() -> int:
    tests = [
        test_labels_match_desktop_rules,
        test_list_places_time_on_the_preview_row,
        test_openapi_stays_0180,
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
