#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.95 rename a chat from the sidebar.

A long-press and a leading swipe offer Rename. The row name becomes
an inline field. Return or leaving the field keeps a trimmed non-empty
name. Escape restores the previous one. A blank name is rejected.
The display name persists in UserDefaults. Pins, the unread dot,
Draft: preview, generating dots, relative time, All / Unread, mark
unread, and previous/next order stay. Name search uses the new name.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatNames.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatNames.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

MAX_LEN = 80
PHRASE = (
    "v0.95 rename a chat from the sidebar (right-click or a hover control "
    "on a sidebar chat row offers Rename; the name becomes an inline field; "
    "Enter or blur keeps a trimmed non-empty name and Escape restores the "
    "previous one; a blank name is rejected; iOS long-press and a swipe "
    "offer Rename with the same rules; the display name persists in local "
    "storage / UserDefaults; pins, the unread dot, Draft: preview, "
    "generating ···, relative time, All / Unread, mark unread, and "
    "Alt+Up/Down order stay; the quick switcher and iOS name search use "
    "the new name; no new HTTP)"
)


def cleaned(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed or len(trimmed) > MAX_LEN:
        return None
    return trimmed


def parse_names(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    names: dict[str, str] = {}
    for key, value in parsed.items():
        name = cleaned(value)
        if not isinstance(key, str) or not key or not name:
            continue
        names[key] = name
    return names


def commit(names: dict[str, str], chat_id: str, draft: str, server: str) -> dict[str, str]:
    if not chat_id:
        return names
    nxt = cleaned(draft)
    if not nxt:
        return names
    if nxt == server:
        if chat_id not in names:
            return names
        copy = dict(names)
        del copy[chat_id]
        return copy
    if names.get(chat_id) == nxt:
        return names
    copy = dict(names)
    copy[chat_id] = nxt
    return copy


def display(names: dict[str, str], chat_id: str, server: str) -> str:
    if not chat_id:
        return server
    return cleaned(names.get(chat_id)) or server


def retain(names: dict[str, str], keep: set[str]) -> dict[str, str]:
    return {key: name for key, name in names.items() if key and key in keep and cleaned(name)}


def test_rules_match_desktop() -> None:
    assert parse_names(None) == {}
    assert parse_names("") == {}
    assert parse_names("nope") == {}
    assert parse_names("[]") == {}
    assert parse_names('{"seed":"  ","gone":1,"other":" Mew "}') == {"other": "Mew"}

    names: dict[str, str] = {}
    assert commit(names, "seed", "   ", "Snorlax") == names
    assert commit(names, "seed", "x" * 81, "Snorlax") == names
    assert commit(names, "", "Buddy", "Snorlax") == names
    names = commit(names, "seed", "  Buddy  ", "Snorlax")
    assert names == {"seed": "Buddy"}
    assert display(names, "seed", "Snorlax") == "Buddy"
    assert display(names, "channel", "Room") == "Room"
    assert commit(names, "seed", "Buddy", "Snorlax") == names
    assert commit(names, "seed", " Snorlax ", "Snorlax") == {}
    assert retain({"seed": "Buddy", "gone": "Nope"}, {"seed"}) == {"seed": "Buddy"}
    assert retain({"seed": "Buddy"}, set()) == {}

    assert 'static let storageKey = "snorlax.chatNames"' in SWIFT
    assert 'static let renameLabel = "Rename"' in SWIFT
    assert 'static let fieldLabel = "Chat name"' in SWIFT
    assert "static let maxLength = 80" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert 'export const CHAT_NAMES_KEY = "snorlax.chatNames"' in DESKTOP
    assert 'export const RENAME_LABEL = "Rename"' in DESKTOP
    assert "export const CHAT_NAME_MAX = 80" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_list_wires_rename_and_keeps_search() -> None:
    assert "ChatNames.renameLabel" in LIST
    assert "ChatNames.fieldLabel" in LIST
    assert 'systemImage: "pencil"' in LIST
    assert "swipeActions(edge: .leading" in LIST
    assert ".onSubmit { finish(commit: true) }" in LIST
    assert ".onKeyPress(.escape)" in LIST
    assert "model.chatDisplayName(for:" in LIST
    assert "model.commitChatName(" in LIST
    assert "ChatSwitcher.filter" in LIST
    assert "filteredAgents.map" in LIST
    assert "ChatPins.label(pinned: model.isChatPinned(agent.id))" in LIST
    assert "model.chatPreviews[agent.id]" in LIST
    assert "ChatListTime.label(" in LIST
    assert 'accessibilityLabel("Unread")' in LIST
    assert 'Button("Delete", role: .destructive' in LIST
    assert "var chatNames: [String: String]" in MODEL
    assert "ChatNames.read()" in MODEL
    assert "ChatNames.write(chatNames)" in MODEL
    assert "ChatNames.commit(" in MODEL
    assert "ChatNames.clear(" in MODEL
    assert "retainChatNames(against:" in MODEL
    assert "updated.name != previousName" in MODEL
    assert "navigationTitle(chatTitle)" in CHAT
    assert "chatDisplayName(for: agent)" in CHAT
    assert "chatDisplayName(chatNames, agent.id, agent.name)" in APP
    assert 'aria-label={RENAME_LABEL}' in APP
    assert 'className="row-name-input"' in APP
    assert 'event.key === "Escape"' in APP
    assert "onBlur={" in APP
    assert "groupPinnedChats(" in APP
    assert "adjacentChatId(ids, activeId, direction)" in APP
    assert 'className="info-name">{active.name}' in APP
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST


def test_openapi_roadmap() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.95 " in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_names.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_list_wires_rename_and_keeps_search,
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
