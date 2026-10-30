#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.26 save a table as csv.

A completed assistant table offers a muted Save control beside
Copy and Cells. Tap or click writes the header and body as
table.csv. A cell with a comma, quote, or newline is quoted.
Desktop downloads the file. iOS opens the system share sheet
and does not ask for photo-library permission. The label reads
Saved for 1.5s. Copy still copies the markdown source and Cells
still copies tabs. A streaming table hides Save. A user bubble
has no Save. The control does not take composer focus. No new
animation. No new shortcut. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "TableCsvSave.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "tableCsvSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.26 save a table as csv"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_csv() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save table"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "table.csv"' in SWIFT
    assert "static func showsSave(completed: Bool) -> Bool" in SWIFT
    assert "static func csvText(header: [String], rows: [[String]]) -> String" in SWIFT
    assert "static func writeFile(csv: String, filename: String) -> URL?" in SWIFT
    assert 'joined(separator: ",")' in SWIFT
    assert 'joined(separator: "\\n")' in SWIFT
    assert 'replacingOccurrences(of: "\\"", with: "\\"\\"")' in SWIFT
    assert 'cell.contains(",")' in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-table" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'TABLE_CSV_SAVE_LABEL = "Save"' in DESKTOP
    assert 'TABLE_CSV_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'TABLE_CSV_SAVE_ARIA = "Save table"' in DESKTOP
    assert 'TABLE_CSV_FILENAME = "table.csv"' in DESKTOP
    assert "export function tableCsvText" in DESKTOP
    assert "export function showTableCsvSave" in DESKTOP
    assert "export function downloadTableCsv" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_save_beside_copy_and_cells() -> None:
    table = _slice(MARKDOWN, "struct MarkdownTableBlock", "struct MermaidFence")
    assert "TableCsvSave.showsSave(completed: completed)" in table
    assert "TableCsvSave.csvText(" in table
    assert "header: table.header" in table
    assert "rows: table.rows" in table
    assert "TableCsvSave.label(saved: saved)" in table
    assert "TableCsvSave.accessibilityLabel(saved: saved)" in table
    assert "TableCsvSave.feedbackNanoseconds" in table
    assert "TableCsvSave.writeFile(csv: csv, filename: TableCsvSave.filename)" in table
    assert "TableCsvSave.keepsTable()" in table
    assert "focusable(false)" in table
    assert "UIActivityViewController" in table
    assert "PHPhotoLibrary" not in table
    assert "MarkdownTableCopy.clipboardText(table.source)" in table
    assert "TableCellsCopy.clipboardText(" in table
    assert "HStack(spacing: 12)" in table
    save = _slice(table, "private func saveTable", "private func tableCell")
    assert "UIPasteboard" not in save
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "TableCsvSave" not in user
    assert "showTableCsvSave(completed)" in BODY
    assert "tableCsvText(table.header, table.rows)" in BODY
    assert "downloadTableCsv(" in BODY
    assert 'className="md-table-save"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert "tableClipboardText(table.source)" in BODY
    assert "Save table" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 226. v2.26" in SPEC
    assert "test_ios_table_csv_save.py" in CI
    assert "tableCsvSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_csv()
    test_save_beside_copy_and_cells()
    test_docs_and_openapi()
    print("ios table csv save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
