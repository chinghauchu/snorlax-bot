#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.89 pin a chat to the top of the chat list.

A leading swipe and a long-press offer Pin / Unpin. Pinned chats sit
in a Pinned group, in the order they were pinned, with a pin glyph.
Unpinned chats keep their order below. Pins persist in UserDefaults.
Deleting a chat drops its pin. The unread dot, preview, relative time,
and All / Unread stay. Unread shows pinned unread chats in that group.
Name search still covers every chat in the current filter. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatPins.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatPins.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.89 pin a chat to the top (right-click or a hover control on a "
    "sidebar chat row offers Pin / Unpin; pinned chats sit in a Pinned "
    "group at the top in the order they were pinned, with a subtle pin "
    "glyph; unpinned chats keep their order below; iOS leading swipe and "
    "long-press offer Pin / Unpin with the same group; pins persist in "
    "local storage / UserDefaults; deleting a chat drops its pin; the "
    "unread dot, last-message preview, relative time, and All / Unread "
    "stay; Unread shows pinned unread chats in the pinned group; the "
    "quick switcher and iOS name search still cover every chat; no new HTTP)"
)


def parse_pins(raw: str | None) -> list[str]:
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


def retain(ids: list[str], keep: set[str]) -> list[str]:
    return [row for row in ids if row and row in keep]


def grouped(rows: list[str], pins: list[str]) -> tuple[list[str], list[str]]:
    present = set(rows)
    pinned: list[str] = []
    taken: set[str] = set()
    for pin in pins:
        if not pin or pin in taken or pin not in present:
            continue
        pinned.append(pin)
        taken.add(pin)
    rest = [row for row in rows if row not in taken]
    return pinned, rest


def test_rules_match_desktop() -> None:
    rows = ["seed", "channel", "other", "late"]
    assert parse_pins(None) == []
    assert parse_pins("") == []
    assert parse_pins("nope") == []
    assert parse_pins("{}") == []
    assert parse_pins('[1, "", "a", "a", "b"]') == ["a", "b"]

    pins: list[str] = []
    pins = toggle(pins, "other")
    pins = toggle(pins, "seed")
    pins = toggle(pins, "other")
    assert pins == ["seed"]
    pins = toggle(pins, "other")
    assert pins == ["seed", "other"]
    assert toggle(pins, "") == pins
    pinned, rest = grouped(rows, pins)
    assert pinned == ["seed", "other"]
    assert rest == ["channel", "late"]
    assert retain(pins, {"other", "late"}) == ["other"]
    assert retain(["gone"], set()) == []

    unread = [row for row in rows if row in {"other", "late"}]
    pinned_unread, rest_unread = grouped(unread, pins)
    assert pinned_unread == ["other"]
    assert rest_unread == ["late"]
    assert grouped([], pins) == ([], [])

    assert 'static let storageKey = "snorlax.chatPins"' in SWIFT
    assert 'static let pinLabel = "Pin"' in SWIFT
    assert 'static let unpinLabel = "Unpin"' in SWIFT
    assert 'static let groupLabel = "Pinned"' in SWIFT
    assert 'static let glyphLabel = "Pinned"' in SWIFT
    assert "pinned ? unpinLabel : pinLabel" in SWIFT
    assert "ids.filter { $0 != id } + [id]" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert 'export const CHAT_PINS_KEY = "snorlax.chatPins"' in DESKTOP
    assert 'export const PINNED_GROUP_LABEL = "Pinned"' in DESKTOP
    assert "return [...ids.filter((row) => row !== id), id]" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_list_wires_pin_and_keeps_search() -> None:
    assert "ChatPins.groupLabel" in LIST
    assert "swipeActions(edge: .leading" in LIST
    assert "ChatPins.label(pinned: model.isChatPinned(agent.id))" in LIST
    assert 'systemImage: "pin"' in LIST
    assert 'Image(systemName: "pin.fill")' in LIST
    assert "ChatPins.glyphLabel" in LIST
    assert "ChatPins.grouped(listedAgents, pinned: model.pinnedChatIDs)" in LIST
    assert "ChatSwitcher.filter" in LIST
    assert "filteredAgents.map" in LIST
    assert "model.chatPreviews[agent.id]" in LIST
    assert "ChatListTime.label(" in LIST
    assert 'accessibilityLabel("Unread")' in LIST
    assert "Button(\"Delete\", role: .destructive" in LIST
    assert "var pinnedChatIDs: [String]" in MODEL
    assert "ChatPins.read()" in MODEL
    assert "ChatPins.write(pinnedChatIDs)" in MODEL
    assert "ChatPins.toggle(pinnedChatIDs, id: id)" in MODEL
    assert "retainChatPins(against: agents)" in MODEL
    assert "clearReplyUnread(id)" in MODEL
    assert 'aria-label={pinned ? UNPIN_LABEL : PIN_LABEL}' in APP
    assert 'className="roster-group">{PINNED_GROUP_LABEL}' in APP
    assert "retainPins(rosterIds)" in APP
    assert "agents.map((agent) => ({" in APP
    assert "id: agent.id" in APP
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST


def test_openapi_roadmap() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.89 " in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_pins.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_list_wires_pin_and_keeps_search,
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
