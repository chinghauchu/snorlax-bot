#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.34 collapse long lists.

A completed assistant bulleted, numbered, or task list with more than
8 items shows the first 8 items and a muted Show more. Tap or click
expands that list and the control becomes Show less. Each list
collapses on its own, including a nested list. The choice is not
saved. 8 items or fewer stay open. A footnote list stays open.
Streaming stays plain text. Copy still copies the whole message,
including hidden items. An active find match in that list stays fully
visible. The control does not take composer focus. No new animation.
No new shortcut. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ListCollapse.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
FOOTNOTES = (IOS / "MarkdownFootnote.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "listCollapse.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.34 collapse long lists"
ITEMS = 8


def overflows(count: int) -> bool:
    return count > ITEMS


def should_collapse(completed: bool, count: int, expanded: bool, active_find: bool) -> bool:
    return completed and overflows(count) and (not expanded) and (not active_find)


def visible(rows: list[str], collapsed: bool) -> list[str]:
    if not collapsed:
        return rows
    return rows[:ITEMS]


def test_rules() -> None:
    nine = [f"item {index}" for index in range(1, 10)]
    assert overflows(8) is False
    assert overflows(9) is True
    assert should_collapse(True, 8, False, False) is False
    assert should_collapse(True, 9, False, False) is True
    assert should_collapse(False, 9, False, False) is False
    assert should_collapse(True, 9, True, False) is False
    assert should_collapse(True, 9, False, True) is False
    assert visible(nine, False) == nine
    assert visible(nine, True) == nine[:8]
    assert "static let itemCount = 8" in SWIFT
    assert 'static let showMore = "Show more"' in SWIFT
    assert 'static let showLess = "Show less"' in SWIFT
    assert 'static let showMoreAria = "Show more list"' in SWIFT
    assert 'static let showLessAria = "Show less list"' in SWIFT
    assert "static func shouldCollapse(" in SWIFT
    assert "static func visibleItems" in SWIFT
    assert "static func findKeepsOpen(" in SWIFT
    assert "ChatFind.indexHits" in SWIFT
    assert "return nil" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "LIST_COLLAPSE_ITEMS = 8" in DESKTOP
    assert 'LIST_SHOW_MORE = "Show more"' in DESKTOP
    assert 'LIST_SHOW_MORE_ARIA = "Show more list"' in DESKTOP
    assert "export function shouldCollapseList" in DESKTOP
    assert "export function listVisibleItems" in DESKTOP
    assert "export function listFindKeepsOpen" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "new Map" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP
    assert "if !completed { return [.markdown(src)] }" in LISTS


def test_clients_collapse_finished_lists() -> None:
    listed = MARKDOWN.split("struct MarkdownListBlock", 1)[1].split(
        "struct MarkdownListItemRow", 1
    )[0]
    assert "ListCollapse.findKeepsOpen(" in listed
    assert "ListCollapse.shouldCollapse(" in listed
    assert "ListCollapse.visibleItems" in listed
    assert "ListCollapse.showsControl(" in listed
    assert "ForEach(Array(shown.enumerated())" in listed
    assert "index: index" in listed
    assert "ListCollapse.label(expanded: expanded)" in listed
    assert "ListCollapse.accessibilityLabel(expanded: expanded)" in listed
    assert "focusable(false)" in listed
    assert "expanded = false" in listed
    assert ".focus(" not in listed
    assert "withAnimation" not in listed
    tasks = MARKDOWN.split("struct MarkdownTaskList", 1)[1].split(
        "struct MarkdownTaskRow", 1
    )[0]
    assert "ListCollapse.visibleItems" in tasks
    assert "ListCollapse.label(expanded: expanded)" in tasks
    assert "focusable(false)" in tasks
    assert "expanded = false" in tasks
    assert "Toggle" not in tasks
    assert "withAnimation" not in tasks
    notes = FOOTNOTES.split("struct MarkdownFootnoteList", 1)[1].split(
        "struct MarkdownFootnotePopover", 1
    )[0]
    assert "ListCollapse" not in notes
    assert "listVisibleItems(items, collapsed)" in BODY
    assert 'className="md-list-more"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert 'className="md-task-list"' in BODY
    assert 'ol: ({ start, children }) => (' in BODY
    assert "<ol start={start}>" in BODY
    assert 'className="md-fn-list"' in BODY
    assert "copyText(reply.content)" in APP
    assert "Show more list" not in SHORTCUTS
    assert "/v1/" not in listed


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 234. v2.34" in SPEC
    assert "test_ios_list_collapse.py" in CI
    assert "listCollapse.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rules()
    test_clients_collapse_finished_lists()
    test_docs_and_openapi()
    print("ios list collapse ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
