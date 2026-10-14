#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.96 archive a chat from the sidebar.

A swipe and a long-press offer Archive. The chat leaves the main
list. An Archived list offers Unarchive, which restores pin and
recency order. Pin is hidden while archived. Option+Up/Down and
Unread skip archived chats. Name search still finds them. A new
reply stays archived and still marks unread. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatArchive.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatArchive.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.96 archive a chat from the sidebar (right-click a sidebar chat "
    "row offers Archive in the menu with Pin, Rename, and Mark unread; "
    "the chat leaves the main list immediately; a muted Archived (n) "
    "toggle at the bottom of the sidebar shows archived chats and "
    "Unarchive puts one back in pin and recency order; if the open chat "
    "is archived, the next chat in Alt+Up/Down order opens, or the empty "
    "state; iOS swipe and long-press offer Archive, and an Archived list "
    "offers Unarchive; archive persists in local storage / UserDefaults; "
    "a new message in an archived chat stays archived and still marks "
    "unread; Pin is hidden in the archived list and the pin is kept for "
    "Unarchive; Unread-only skips archived chats; Alt+Up/Down skips "
    "archived chats; the quick switcher and iOS name search still find "
    "archived chats; Reduce Motion adds no animation; no new HTTP)"
)


def parse_ids(raw: str | None) -> list[str]:
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


def archive(ids: list[str], chat_id: str) -> list[str]:
    if not chat_id or chat_id in ids:
        return list(ids)
    return list(ids) + [chat_id]


def unarchive(ids: list[str], chat_id: str) -> list[str]:
    if not chat_id or chat_id not in ids:
        return list(ids)
    return [row for row in ids if row != chat_id]


def retain(ids: list[str], keep: set[str]) -> list[str]:
    return [row for row in ids if row and row in keep]


def adjacent(ids: list[str], current: str | None, direction: int) -> str | None:
    if direction not in (-1, 1) or not current:
        return None
    try:
        index = ids.index(current)
    except ValueError:
        return None
    nxt = index + direction
    if nxt < 0 or nxt >= len(ids):
        return None
    chosen = ids[nxt]
    if not chosen or chosen == current:
        return None
    return chosen


def selection_after(visible: list[str], open_id: str | None, archived_id: str) -> str | None:
    if not archived_id:
        return open_id
    if open_id != archived_id:
        return open_id
    return adjacent(visible, open_id, 1)


def test_rules_match_desktop() -> None:
    assert parse_ids(None) == []
    assert parse_ids("") == []
    assert parse_ids("nope") == []
    assert parse_ids("{}") == []
    assert parse_ids('[1, "", "a", "a", "b"]') == ["a", "b"]

    ids: list[str] = []
    ids = archive(ids, "b")
    ids = archive(ids, "a")
    ids = archive(ids, "b")
    assert ids == ["b", "a"]
    ids = unarchive(ids, "b")
    assert ids == ["a"]
    assert unarchive(ids, "") == ids
    assert retain(["a", "gone"], {"a"}) == ["a"]

    visible = ["c", "a", "b", "d"]
    assert selection_after(visible, "a", "a") == "b"
    assert selection_after(visible, "d", "d") is None
    assert selection_after(visible, "b", "a") == "b"
    assert selection_after(visible, None, "a") is None
    live = [row for row in visible if row not in {"a"}]
    assert live == ["c", "b", "d"]
    pins = ["c", "a"]
    pinned = [pin for pin in pins if pin in live]
    rest = [row for row in live if row not in pinned]
    assert pinned == ["c"]
    assert rest == ["b", "d"]
    restored = [row for row in ["a", "b", "c", "d"] if row not in set()]
    pinned_back = [pin for pin in pins if pin in restored]
    assert pinned_back == ["c", "a"]

    assert 'static let storageKey = "snorlax.chatArchives"' in SWIFT
    assert 'static let archiveLabel = "Archive"' in SWIFT
    assert 'static let unarchiveLabel = "Unarchive"' in SWIFT
    assert 'static let sectionLabel = "Archived"' in SWIFT
    assert "ChatNav.adjacent" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert 'export const CHAT_ARCHIVES_KEY = "snorlax.chatArchives"' in DESKTOP
    assert 'export const ARCHIVE_LABEL = "Archive"' in DESKTOP
    assert "return adjacentChatId(visibleIds, openId, 1)" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_list_wires_archive_and_keeps_search() -> None:
    assert "ChatArchive.sectionTitle" in LIST
    assert "ChatArchive.archiveLabel" in LIST
    assert "ChatArchive.unarchiveLabel" in LIST
    assert 'accessibilityLabel("Back to chats")' in LIST
    assert "model.archiveChat(agent.id)" in LIST
    assert "model.unarchiveChat(agent.id)" in LIST
    assert "showsPinGlyph: !archived" in LIST
    assert "swipeActions(edge: .leading" in LIST
    assert "swipeActions(edge: .trailing" in LIST
    assert 'systemImage: "archivebox"' in LIST
    assert "ChatSwitcher.filter" in LIST
    assert "filteredAgents.map" in LIST
    assert "ChatPins.grouped(listedAgents, pinned: model.pinnedChatIDs)" in LIST
    assert "ChatPins.label(pinned: model.isChatPinned(agent.id))" in LIST
    assert "var archivedChatIDs: [String]" in MODEL
    assert "ChatArchive.read()" in MODEL
    assert "ChatArchive.write(archivedChatIDs)" in MODEL
    assert "func archiveChat(_ id: String)" in MODEL
    assert "func unarchiveChat(_ id: String)" in MODEL
    assert "ChatArchive.selectionAfterArchive" in MODEL
    assert "!isChatArchived($0.id)" in MODEL
    assert "retainChatArchives(against:" in MODEL
    assert "func visibleChatOrder()" in MODEL
    reply = MODEL.split("private func noteFinishedAssistantReply", 1)[1]
    reply = reply.split("private func handle", 1)[0]
    assert "replyMarksUnread" in reply
    assert "unarchiveChat" not in reply
    assert "archiveChat" not in reply
    assert 'aria-label={ARCHIVE_LABEL}' in APP
    assert 'aria-expanded={archiveOpen}' in APP
    assert "selectionAfterArchive(visibleIds, activeId, id)" in APP
    assert "computerPane.ts" not in APP
    assert "computerPane.ts" not in LIST
    assert "withAnimation" not in LIST


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.96 " in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_archive.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_list_wires_archive_and_keeps_search,
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
