#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.76 New messages divider.

A thin muted line reading New messages sits above the first assistant
LEFT message that arrived since you last viewed that chat. The same
not-open or unfocused condition as the unread dot freezes a per-chat
last-seen id (desktop localStorage, iOS UserDefaults). Opening computes
the line once and it stays put. It clears when you come back with
nothing new, or when you Send. Your own bubbles and collapsed tool
lines do not anchor it. A day separator stays above it. No animation.
No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "NewMessages.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "newMessages.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.76 new messages divider (a thin muted New messages line above the "
    "first assistant reply that arrived since you last viewed that chat; "
    "the same not-open or unfocused condition as the unread dot; computed "
    "once on open and it stays put; cleared when you come back with nothing "
    "new or when you Send; your own bubbles and collapsed tool lines do not "
    "anchor it; a day separator stays above it; desktop local storage; iOS "
    "UserDefaults; no animation; no new HTTP)"
)
STORAGE_KEY = "snorlax.chatLastSeen"
LABEL = "New messages"


def anchors(
    from_user: bool,
    kind_message: bool,
    has_token: bool,
    collapsed_tool: bool,
    visible: bool = True,
) -> bool:
    return visible and (not collapsed_tool) and (not from_user) and kind_message and has_token


def anchor_index(rows: list[tuple[str, bool]], last_seen: str | None) -> int | None:
    if not last_seen:
        return None
    try:
        at = next(i for i, row in enumerate(rows) if row[0] == last_seen)
    except StopIteration:
        return None
    for i in range(at + 1, len(rows)):
        if rows[i][1]:
            return i
    return None


def place(
    placed: bool,
    place_key: str | None,
    anchor: str | None,
    key: str,
    rows: list[tuple[str, bool]],
    last_seen: str | None,
    returning: bool,
) -> tuple[bool, str | None, str | None]:
    if not returning and placed and place_key == key:
        return placed, place_key, anchor
    index = anchor_index(rows, last_seen)
    if index is None:
        if placed and place_key == key:
            return True, place_key, anchor
        return True, key, None
    return True, key, rows[index][0]


def token(agent_id: str, thread_id: str | None) -> str:
    return agent_id + "\0" + (thread_id or "")


def test_rules() -> None:
    rows = [
        ("old", False),
        ("seen", True),
        ("mine", False),
        ("tool", False),
        ("fresh", True),
    ]
    assert anchor_index(rows, None) is None
    assert anchor_index(rows, "missing") is None
    assert anchor_index(rows, "seen") == 4
    assert anchor_index([("seen", True), ("mine", False)], "seen") is None
    assert anchors(False, True, True, False) is True
    assert anchors(True, True, True, False) is False
    assert anchors(False, False, True, True) is False
    assert anchors(False, True, True, True) is False
    assert anchors(False, True, False, False) is False
    assert anchors(False, True, True, False, visible=False) is False

    opened = place(False, None, None, "chat", rows, "seen", True)
    assert opened[2] == "fresh"
    stayed = place(True, "chat", "fresh", "chat", rows + [("later", True)], "later", False)
    assert stayed[2] == "fresh"
    quiet = place(True, "chat", "fresh", "chat", rows, "fresh", True)
    assert quiet[2] == "fresh"
    away = place(False, "other", None, "chat", rows, "fresh", True)
    assert away[2] is None
    assert token("agent-a", None) != token("agent-a", "thread")


def test_sources() -> None:
    assert LABEL == "New messages"
    assert f'static let label = "{LABEL}"' in SWIFT
    assert f'static let storageKey = "{STORAGE_KEY}"' in SWIFT
    assert "UserDefaults" in SWIFT
    assert "func anchors(" in SWIFT
    assert "func anchorIndex(" in SWIFT
    assert "func place(" in SWIFT
    assert "static func clear(" in SWIFT
    assert "struct NewMessagesDivider" in SWIFT
    assert "animation" not in SWIFT.split("struct NewMessagesDivider", 1)[1]
    assert "withAnimation" not in CHAT[CHAT.index("NewMessagesDivider()") - 200 : CHAT.index("NewMessagesDivider()") + 80]

    day_at = CHAT.index("if let dayLabel = dayLabels[index]")
    line_at = CHAT.index("NewMessagesDivider()", day_at)
    item_at = CHAT.index("transcriptItem(", line_at)
    assert day_at < line_at < item_at

    assert "newMessagesAnchorID" in MODEL
    assert "chatLastSeen" in MODEL
    assert "syncNewMessages(returning:" in MODEL
    assert "NewMessages.clear(newMessagesPlace)" in MODEL
    assert "newMessagesReturning = true" in MODEL
    assert "chatLastSeen.retain" in MODEL
    assert "watchingNewMessages = false" in MODEL

    send = MODEL.split("func send() async", 1)[1].split("func ", 1)[0]
    assert "NewMessages.clear(newMessagesPlace)" in send

    focus = MODEL.split("func setSceneFocused", 1)[1].split("func ", 1)[0]
    assert "syncNewMessages(returning: true)" in focus
    assert "watchingNewMessages = false" in focus

    assert "localStorage" in DESKTOP
    assert STORAGE_KEY in DESKTOP
    assert 'NEW_MESSAGES_LABEL = "New messages"' in DESKTOP
    assert 'className="new-messages"' in DESKTOP_APP
    assert "clearNewMessages(" in DESKTOP_APP
    assert not DESKTOP_PANE.exists()
    assert "0.18.0" in OPENAPI
    assert "0.18.0" in RUNTIME_OPENAPI
    assert "0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "/v1/" not in DESKTOP.split("export const", 1)[0]
    assert PHRASE in ROADMAP
    assert "test_ios_new_messages.py" in CI
    assert "newMessages.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")


def test_storage_shape() -> None:
    blob = {token("agent-a", None): "m1", "bad": "x", token("agent-b", "t"): ""}
    raw = json.dumps(blob)
    parsed = json.loads(raw)
    kept = {
        key: value
        for key, value in parsed.items()
        if isinstance(value, str) and value and "\0" in key and key.split("\0", 1)[0]
    }
    assert kept == {token("agent-a", None): "m1"}


def main() -> None:
    test_rules()
    test_sources()
    test_storage_shape()
    print("ios new messages ok")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
