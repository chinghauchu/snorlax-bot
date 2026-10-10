#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.72 quick chat switcher over the roster already loaded.

Desktop Cmd/Ctrl-K opens a small overlay. Fuzzy name match narrows
agents and channels. Arrow keys and Enter switch. Esc closes. iOS
pull-down search on the chat list narrows the same names. No new
HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWITCH = (IOS / "ChatSwitcher.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_SWITCH = (ROOT / "desktop" / "src" / "chatSwitcher.ts").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.72 quick chat switcher (Cmd/Ctrl-K opens a small overlay that "
    "fuzzy-filters existing agents and chats by name; arrow keys and "
    "Enter switch to that chat; Esc closes; iOS search field on the "
    "chat list narrows chats by name; no new HTTP)"
)


def query_active(query: str) -> bool:
    return query.strip() != ""


def fuzzy_score(name: str, needle: str) -> int | None:
    hay = name.lower()
    query = needle.lower()
    if not query:
        return 0
    score = 0
    hi = 0
    prev = -2
    first = -1
    for unit in query:
        at = hay.find(unit, hi)
        if at < 0:
            return None
        if first < 0:
            first = at
        score += 1
        if at == prev + 1:
            score += 4
        if at == 0 or (at > 0 and hay[at - 1] in " -_"):
            score += 2
        prev = at
        hi = at + 1
    score += max(0, 8 - first)
    return score


def filter_chats(chats: list[dict[str, str]], query: str) -> list[str]:
    needle = query.strip().lower()
    if not needle:
        return [chat["id"] for chat in chats]
    ranked: list[tuple[int, int, str]] = []
    for index, chat in enumerate(chats):
        score = fuzzy_score(chat["name"], needle)
        if score is None:
            continue
        ranked.append((score, index, chat["id"]))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return [row[2] for row in ranked]


ROSTER = [
    {"id": "snorlax", "name": "Snorlax"},
    {"id": "design", "name": "Design notes"},
    {"id": "notes", "name": "Notes"},
    {"id": "group", "name": "Snorlax-Bot"},
]


def test_fuzzy_filter_ranks_names() -> None:
    assert query_active("  ") is False
    assert query_active("s") is True
    assert fuzzy_score("axb", "a.b") is None
    assert fuzzy_score("a.b", "a.b") is not None
    assert filter_chats(ROSTER, "  ") == ["snorlax", "design", "notes", "group"]
    assert filter_chats(ROSTER, "sn") == ["snorlax", "group", "design"]
    assert filter_chats(ROSTER, "NOTES") == ["notes", "design"]
    assert filter_chats(ROSTER, "slx") == ["snorlax", "group"]
    assert filter_chats(ROSTER, "bot") == ["group"]
    assert filter_chats(ROSTER, "zzz") == []


def test_ios_wires_chat_list_search() -> None:
    assert "Switch chat" in SWITCH
    assert "Search chats" in SWITCH
    assert "No chats" in SWITCH
    assert "func filter" in SWITCH
    assert "No HTTP" in SWITCH
    assert "/v1/" not in SWITCH
    assert ".searchable" in LIST
    assert "ChatSwitcher.filter" in LIST
    assert "ChatSwitcher.placeholder" in LIST
    assert "ChatSwitcher.emptyLabel" in LIST
    assert "ChatSwitcher.inputLabel" in LIST
    assert "ChatSwitcher.queryActive" in LIST
    assert "computerPane.ts" not in LIST


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    for doc in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in doc
        assert "version: 0.19" not in doc
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_switcher.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in SWITCH
    assert "/v1/" not in DESKTOP_SWITCH
    assert "No HTTP" in DESKTOP_SWITCH


def main() -> int:
    tests = [
        test_fuzzy_filter_ranks_names,
        test_ios_wires_chat_list_search,
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
    sys.exit(main())
