#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.24 copy a table as cells.

A completed assistant table offers a muted Cells control beside
Copy. Tap or click copies the header and body as tab-separated
cells. The delimiter row is left out. The label reads Copied for
1.5s. Copy still copies the markdown source. A streaming table
hides Cells. The control does not take composer focus. No new
animation. No new shortcut. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "TableCellsCopy.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
TABLE = (IOS / "MarkdownTable.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "tableCellsCopy.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.24 copy a table as cells"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_grid() -> None:
    assert 'static let cellsLabel = "Cells"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copyAria = "Copy cells"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert "static func showsCells(completed: Bool) -> Bool" in SWIFT
    assert "static func clipboardText(header: [String], rows: [[String]]) -> String" in SWIFT
    assert 'joined(separator: "\\t")' in SWIFT
    assert 'joined(separator: "\\n")' in SWIFT
    assert "return nil" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'TABLE_CELLS_LABEL = "Cells"' in DESKTOP
    assert 'TABLE_CELLS_ARIA = "Copy cells"' in DESKTOP
    assert "export function tableCellsClipboardText" in DESKTOP
    assert "export function showTableCells" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "Not tab-separated" in TABLE


def test_cells_beside_markdown_copy() -> None:
    table = _slice(MARKDOWN, "struct MarkdownTableBlock", "private func tableCell")
    assert "TableCellsCopy.showsCells(completed: completed)" in table
    assert "TableCellsCopy.clipboardText(" in table
    assert "header: table.header" in table
    assert "rows: table.rows" in table
    assert "TableCellsCopy.label(copied: cellsCopied)" in table
    assert "TableCellsCopy.accessibilityLabel(copied: cellsCopied)" in table
    assert "TableCellsCopy.feedbackNanoseconds" in table
    assert "focusable(false)" in table
    assert "UIPasteboard.general.string" in table
    assert "MarkdownTableCopy.clipboardText(table.source)" in table
    assert "HStack(spacing: 12)" in table
    assert "showTableCells(completed)" in BODY
    assert "tableCellsClipboardText(table.header, table.rows)" in BODY
    assert "tableClipboardText(table.source)" in BODY
    assert 'className="md-table-actions"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert "Copy cells" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 224. v2.24" in SPEC
    assert "test_ios_table_cells_copy.py" in CI
    assert "tableCellsCopy.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_grid()
    test_cells_beside_markdown_copy()
    test_docs_and_openapi()
    print("ios table cells copy ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
