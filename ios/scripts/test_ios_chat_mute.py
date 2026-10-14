#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.02 mute a chat from the sidebar.

A long-press and a swipe offer Mute / Unmute. A muted chat still
receives messages and still opens. It does not paint the unread
accent dot, and a finished assistant reply does not add it to the
unread count outside the list. The Unread filter skips it. The row
shows a muted glyph. Mute persists in UserDefaults. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatMute.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatMute.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.02 mute a chat from the sidebar (right-click or a hover control on a "
    "sidebar chat row offers Mute / Unmute; a muted chat stops showing the "
    "unread accent dot and a new assistant reply does not add it to the unread "
    "count outside the list; messages still arrive and opening the chat works "
    "as usual; the row shows a subtle muted glyph; mute persists in local "
    "storage / UserDefaults; iOS long-press and a swipe offer Mute / Unmute; "
    "the Unread filter skips muted chats; pins, rename, archive, Draft: "
    "preview, generating ···, relative time, All / Unread, Alt+Up/Down, mark "
    "unread, and section headers stay; no new HTTP)"
)


def parse_mutes(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    ids: list[str] = []
    seen: set[str] = set()
    for item in parsed:
        if not isinstance(item, str) or not item or item in seen:
            continue
        seen.add(item)
        ids.append(item)
    return ids


def toggle(ids: list[str], chat_id: str) -> list[str]:
    if not chat_id:
        return list(ids)
    if chat_id in ids:
        return [row for row in ids if row != chat_id]
    return [row for row in ids if row != chat_id] + [chat_id]


def audible(ids: set[str], muted: list[str]) -> set[str]:
    hidden = set(muted)
    return {row for row in ids if row and row not in hidden}


def paints(muted: bool, would: bool) -> bool:
    return False if muted else would


def test_rules_match_desktop() -> None:
    assert parse_mutes(None) == []
    assert parse_mutes("") == []
    assert parse_mutes("nope") == []
    assert parse_mutes("{}") == []
    assert parse_mutes('[1, "", "a", "a", "b"]') == ["a", "b"]

    ids: list[str] = []
    ids = toggle(ids, "seed")
    ids = toggle(ids, "other")
    assert ids == ["seed", "other"]
    ids = toggle(ids, "seed")
    assert ids == ["other"]
    assert toggle(ids, "") == ids

    stored = {"seed", "other", ""}
    heard = audible(stored, ["other"])
    assert heard == {"seed"}
    assert paints(True, True) is False
    assert paints(False, True) is True
    rows = ["seed", "other", "late"]
    visible = [row for row in rows if paints(row in {"other"}, row in stored)]
    assert visible == ["seed"]

    assert 'static let storageKey = "snorlax.chatMutes"' in SWIFT
    assert 'static let muteLabel = "Mute"' in SWIFT
    assert 'static let unmuteLabel = "Unmute"' in SWIFT
    assert 'static let glyphLabel = "Muted"' in SWIFT
    assert "static func replyMayMarkUnread" in SWIFT
    assert "static func audible" in SWIFT
    assert "/v1/" not in SWIFT
    assert 'export const CHAT_MUTES_KEY = "snorlax.chatMutes"' in DESKTOP
    assert 'export const MUTE_LABEL = "Mute"' in DESKTOP
    assert "export function replyMayMarkUnread" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_list_wires_mute_and_keeps_the_rest() -> None:
    assert "ChatMute.label(muted: muted)" in LIST
    assert "ChatMute.label(muted: model.isChatMuted(agent.id))" in LIST
    assert "model.toggleChatMute(agent.id)" in LIST
    assert 'systemImage: "bell.slash"' in LIST
    assert "accessibilityLabel(ChatMute.glyphLabel)" in LIST
    assert "swipeActions(edge: .leading" in LIST
    assert "ChatPins.label(pinned: model.isChatPinned(agent.id))" in LIST
    assert "ChatUnread.actionLabel(showsDot: model.showsUnreadDot(agent))" in LIST
    assert "ChatArchive.archiveLabel" in LIST
    assert "model.showsUnreadDot" in LIST
    assert "func toggleChatMute(_ id: String)" in MODEL
    assert "chatUnread.clear(id)" in MODEL
    assert "ChatMute.replyMayMarkUnread(muted: isChatMuted(chatId))" in MODEL
    assert "ChatMute.audible(replyUnreadIDs, muted: mutedChatIDs)" in MODEL
    assert "replyUnreadIDs = chatUnread.snapshot" in MODEL
    assert "UnreadOutside.count(replyUnreadIDs)" in MODEL
    assert "noteFinishedAssistantReply(chatId: agentId, message: message)" in MODEL
    assert "function onToggleMute(" in APP
    assert "noteReplyUnread(streamChatId)" in APP
    assert "applyUnreadChrome(unreadChrome(replyUnreadIds))" in APP
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST
    assert not PANE.exists()


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.02 " in ROADMAP
    assert "## 102. v1.02" in SPEC
    assert "python3 ios/scripts/test_ios_chat_mute.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_list_wires_mute_and_keeps_the_rest,
        test_openapi_roadmap,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
