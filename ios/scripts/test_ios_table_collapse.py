#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.33 collapse long tables.

A completed assistant table with more than 8 body rows shows the
header and the first 8 body rows, plus a muted Show more. Tap or
click expands that table and the control becomes Show less. Each
table collapses on its own. The choice is not saved. Streaming stays
plain text. Copy, Cells, and Save still use the full table, including
hidden rows. An active find match in that table stays fully visible.
The control does not take composer focus. No new animation. No new
shortcut. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "TableCollapse.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "tableCollapse.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.33 collapse long tables"
ROWS = 8


def overflows(count: int) -> bool:
    return count > ROWS


def should_collapse(completed: bool, count: int, expanded: bool, active_find: bool) -> bool:
    return completed and overflows(count) and (not expanded) and (not active_find)


def visible(rows: list[list[str]], collapsed: bool) -> list[list[str]]:
    if not collapsed:
        return rows
    return rows[:ROWS]


def test_rules() -> None:
    nine = [[f"r{index}", "x"] for index in range(1, 10)]
    assert overflows(8) is False
    assert overflows(9) is True
    assert should_collapse(True, 8, False, False) is False
    assert should_collapse(True, 9, False, False) is True
    assert should_collapse(False, 9, False, False) is False
    assert should_collapse(True, 9, True, False) is False
    assert should_collapse(True, 9, False, True) is False
    assert visible(nine, False) == nine
    assert [row[0] for row in visible(nine, True)] == [
        "r1",
        "r2",
        "r3",
        "r4",
        "r5",
        "r6",
        "r7",
        "r8",
    ]
    assert "static let bodyRows = 8" in SWIFT
    assert 'static let showMore = "Show more"' in SWIFT
    assert 'static let showLess = "Show less"' in SWIFT
    assert 'static let showMoreAria = "Show more table"' in SWIFT
    assert 'static let showLessAria = "Show less table"' in SWIFT
    assert "static func shouldCollapse(" in SWIFT
    assert "static func visibleRows(" in SWIFT
    assert "static func findKeepsOpen(" in SWIFT
    assert "ChatFind.indexHits" in SWIFT
    assert "return nil" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "TABLE_COLLAPSE_ROWS = 8" in DESKTOP
    assert 'TABLE_SHOW_MORE = "Show more"' in DESKTOP
    assert 'TABLE_SHOW_MORE_ARIA = "Show more table"' in DESKTOP
    assert "export function shouldCollapseTable" in DESKTOP
    assert "export function tableVisibleRows" in DESKTOP
    assert "export function tableFindKeepsOpen" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "new Map" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP


def test_clients_collapse_finished_tables() -> None:
    table = MARKDOWN.split("struct MarkdownTableBlock", 1)[1].split("struct MermaidFence", 1)[0]
    assert "TableCollapse.findKeepsOpen(" in table
    assert "TableCollapse.shouldCollapse(" in table
    assert "TableCollapse.visibleRows" in table
    assert "TableCollapse.showToggle(" in table
    assert "ForEach(Array(shownRows.enumerated())" in table
    assert "rows: table.rows" in table
    assert "MarkdownTableCopy.clipboardText(table.source)" in table
    assert "TableCollapse.label(expanded: expanded)" in table
    assert "TableCollapse.accessibilityLabel(expanded: expanded)" in table
    assert "focusable(false)" in table
    assert "expanded = false" in table
    assert "wrapScope: wrapScope" in MARKDOWN
    button = table.split("Button(TableCollapse.label", 1)[1].split("private func saveTable", 1)[0]
    assert ".focus(" not in button
    assert "tableVisibleRows(table.rows, collapsed)" in BODY
    assert 'className="md-table-more"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert "tableClipboardText(table.source)" in BODY
    assert "tableCsvText(table.header, table.rows)" in BODY
    assert "Show more table" not in SHORTCUTS
    assert "/v1/" not in table


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 233. v2.33" in SPEC
    assert "test_ios_table_collapse.py" in CI
    assert "tableCollapse.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rules()
    test_clients_collapse_finished_tables()
    test_docs_and_openapi()
    print("ios table collapse ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
