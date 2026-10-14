#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.77 unread reply count outside the chat list.

The count is the v0.70 unread-dot set. Desktop window title and the
dock or taskbar badge (where Tauri supports a count) show it, and
clear when nothing is unread. iOS chat list title matches. The app
icon badge is set only when badge permission is already granted.
Asking on first launch would prompt, so the app does not request it.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OUTSIDE = (IOS / "UnreadOutside.swift").read_text(encoding="utf-8")
CONTENT = (IOS / "ContentView.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "unreadOutside.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
RUST = (ROOT / "desktop" / "src-tauri" / "src" / "main.rs").read_text(encoding="utf-8")
CAPS = (ROOT / "desktop" / "src-tauri" / "capabilities" / "default.json").read_text(
    encoding="utf-8"
)
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.77 unread count outside the chat list (when one or more chats "
    "carry the v0.70 unread dot, the desktop window title reads (2) "
    "Snorlax-Bot and the dock or taskbar badge shows that count where "
    "Tauri supports it; both clear when nothing is unread; the iOS chat "
    "list title shows the same count; the app icon badge shows it only "
    "when badge permission is already granted; no new HTTP)"
)
APP_NAME = "Snorlax-Bot"


def title(count: int) -> str:
    if count <= 0:
        return APP_NAME
    return f"({count}) {APP_NAME}"


def badge(count: int) -> int | None:
    return count if count > 0 else None


def reply_count(ids: set[str]) -> int:
    return sum(1 for item in ids if item)


def icon_badge_allowed(authorized: bool, badge_enabled: bool) -> bool:
    return authorized and badge_enabled


def test_rules() -> None:
    assert reply_count(set()) == 0
    assert reply_count({"", "agent-a"}) == 1
    assert reply_count({"agent-a", "agent-b"}) == 2
    assert title(0) == "Snorlax-Bot"
    assert title(2) == "(2) Snorlax-Bot"
    assert badge(0) is None
    assert badge(2) == 2
    assert icon_badge_allowed(True, True)
    assert not icon_badge_allowed(False, True)
    assert not icon_badge_allowed(True, False)
    assert not icon_badge_allowed(False, False)


def test_sources() -> None:
    assert 'static let appName = "Snorlax-Bot"' in OUTSIDE
    assert "func title(count: Int)" in OUTSIDE
    assert "func iconBadgeAllowed" in OUTSIDE
    assert "authorizationStatus == .authorized" in OUTSIDE
    assert "badgeSetting == .enabled" in OUTSIDE
    assert "setBadgeCount" in OUTSIDE
    assert "requestAuthorization" not in OUTSIDE
    assert "requestAuthorization" not in MODEL
    assert "requestAuthorization" not in CONTENT
    assert "/v1/" not in OUTSIDE

    title_call = "UnreadOutside.title(count: UnreadOutside.count(model.replyUnreadIDs))"
    assert CONTENT.count(title_call) == 2
    assert 'navigationTitle("Snorlax-Bot")' not in CONTENT
    assert "navigationTitle(chatTitle)" in CHAT
    assert "chatDisplayName(for: agent)" in CHAT
    assert "unreadChannelIDs" not in OUTSIDE

    assert "publishReplyUnread()" in MODEL
    assert "replyUnreadIDs = chatUnread.snapshot" in MODEL
    assert "UnreadOutside.applyIconBadge" in MODEL
    assert "UnreadOutside.count(replyUnreadIDs)" in MODEL

    assert 'APP_TITLE = "Snorlax-Bot"' in DESKTOP
    assert "applyUnreadChrome(unreadChrome(replyUnreadIds))" in DESKTOP_APP
    assert "unreadChrome(unreadIds)" not in DESKTOP_APP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "fn set_unread_chrome" in RUST
    assert "set_title" in RUST
    assert "set_badge_count" in RUST
    assert "allow-set-unread-chrome" in CAPS
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in OUTSIDE
    assert "computerPane.ts" not in DESKTOP_APP

    assert "0.18.0" in OPENAPI
    assert "0.18.0" in RUNTIME_OPENAPI
    assert "0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "test_ios_unread_outside.py" in CI
    assert "unreadOutside.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )


def main() -> None:
    test_rules()
    test_sources()
    print("ios unread outside ok")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
