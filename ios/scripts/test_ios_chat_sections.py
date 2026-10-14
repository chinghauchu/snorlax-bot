#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.97 sidebar section headers.

Muted Pinned and Chats headers group the chat list. An empty
group hides its header. The Archived list keeps its own header
and does not grow a Chats header. Pin order, All / Unread,
Draft:, generating dots, relative time, the unread dot, and
rename stay. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatSections.swift").read_text(encoding="utf-8")
PINS = (IOS / "ChatPins.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatSections.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.97 sidebar section headers (muted section headers group the "
    "sidebar and the iOS chat list; the existing Pinned header stays "
    "when that group has rows; unpinned chats sit under a Chats header; "
    "an empty group hides its header; All / Unread, the archive list, "
    "pin order, Draft: preview, generating ···, relative time, the "
    "unread dot, rename, and Alt+Up/Down visible order stay; the archive "
    "list keeps Archived and does not grow a Chats header; Reduce Motion "
    "adds no animation; no new HTTP)"
)


def section_has_rows(count: float) -> bool:
    return count == count and count != float("inf") and count > 0


def headers(pinned: float, rest: float) -> list[str]:
    out: list[str] = []
    if section_has_rows(pinned):
        out.append("Pinned")
    if section_has_rows(rest):
        out.append("Chats")
    return out


def test_rules_match_desktop() -> None:
    cases = [
        (0, 0, []),
        (2, 0, ["Pinned"]),
        (0, 3, ["Chats"]),
        (1, 4, ["Pinned", "Chats"]),
        (-1, float("nan"), []),
    ]
    for pinned, rest, expect in cases:
        assert headers(pinned, rest) == expect
    assert 'export const CHATS_SECTION_LABEL = "Chats"' in DESKTOP
    assert "export function rosterSectionHeaders(" in DESKTOP
    assert 'headers.push("pinned")' in DESKTOP
    assert 'headers.push("chats")' in DESKTOP
    assert 'static let chatsLabel = "Chats"' in SWIFT
    assert "static func showsHeader(count: Int) -> Bool" in SWIFT
    assert "count > 0" in SWIFT
    assert "ChatPins.groupLabel" in SWIFT
    assert "headers.append(chatsLabel)" in SWIFT
    assert 'static let groupLabel = "Pinned"' in PINS
    assert "/v1/" not in DESKTOP
    assert "/v1/" not in SWIFT


def test_list_wires_headers_and_keeps_rows() -> None:
    assert "ChatSections.labels(" in LIST
    assert "headers.contains(ChatPins.groupLabel)" in LIST
    assert "headers.contains(ChatSections.chatsLabel)" in LIST
    assert "Text(ChatSections.chatsLabel)" in LIST
    assert "Text(ChatPins.groupLabel)" in LIST
    assert "Text(ChatArchive.sectionLabel)" in LIST
    assert "ChatArchive.sectionTitle" in LIST
    assert "model.chatListPreview(" in LIST
    assert "GeneratingDots()" in LIST
    assert "ChatListTime.label(" in LIST
    assert 'accessibilityLabel("Unread")' in LIST
    assert "ChatNames.renameLabel" in LIST
    assert "withAnimation" not in LIST
    roster = APP.split('<ul className="roster">', 1)[1].split("</ul>", 1)[0]
    assert 'className="roster-group">{PINNED_GROUP_LABEL}' in roster
    assert 'className="roster-group">{CHATS_SECTION_LABEL}' in roster
    assert roster.index('includes("pinned")') < roster.index("pinnedAgents.map")
    assert roster.index("pinnedAgents.map") < roster.index('includes("chats")')
    assert roster.index('includes("chats")') < roster.index("restAgents.map")
    archive = APP.split('className="roster-archive-list"', 1)[1].split("</ul>", 1)[0]
    assert "CHATS_SECTION_LABEL" not in archive
    assert "roster-group" not in archive
    assert "[...pinnedAgents, ...restAgents]" in APP
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST


def test_openapi_roadmap() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.97 " in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_sections.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_list_wires_headers_and_keeps_rows,
        test_openapi_roadmap,
    ]
    failed = 0
    for test in tests:
        try:
            test()
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    if failed:
        print(f"{failed} failed")
        return 1
    print(f"ok {len(tests)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
