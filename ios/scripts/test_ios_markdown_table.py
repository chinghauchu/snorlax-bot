#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.31 markdown tables in completed assistant replies.

A completed LEFT kind=message pipe table renders as a table. A wide
table scrolls horizontally inside its own container. Copy writes the
markdown source and shows Copied for 1.5s. Streaming stays plain text.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownTable.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownTable.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.31 markdown tables in completed assistant replies"


def test_copy_is_markdown_source_and_does_not_animate() -> None:
    assert 'static let copyLabel = "Copy"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copyAria = "Copy table"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert "static let feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "static func showsCopy(completed: Bool) -> Bool" in SWIFT
    assert "static func clipboardText(_ source: String) -> String" in SWIFT
    assert "return source" in SWIFT
    assert "Not tab-separated" in SWIFT or "Not tab-separated." in SWIFT
    assert "return nil" in SWIFT
    assert "/v1/" not in SWIFT
    assert "markdown source" in DESKTOP
    assert "export function tableClipboardText" in DESKTOP
    assert "export const TABLE_COPY_MS = 1500" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_table_scrolls_and_copies() -> None:
    assert "MarkdownTable.split(source, completed: completed)" in MARKDOWN
    assert "MarkdownTableBlock" in MARKDOWN
    assert "ScrollView(.horizontal, showsIndicators: true)" in MARKDOWN
    assert "MarkdownTableCopy.clipboardText(table.source)" in MARKDOWN
    assert "MarkdownTableCopy.showsCopy(completed: completed)" in MARKDOWN
    assert "MarkdownTableCopy.accessibilityLabel(copied: copied)" in MARKDOWN
    assert "MarkdownTableCopy.animation(reduceMotion: reduceMotion)" in MARKDOWN
    assert ".fixedSize(horizontal: true, vertical: true)" in MARKDOWN
    assert "hugsText: true" in MARKDOWN
    assert "splitMarkdownTables(stable, completed)" in BODY
    assert "tableClipboardText(table.source)" in BODY
    assert 'className="md-table-scroll"' in BODY
    assert "assistantBubbleWide(part, completed)" in APP
    assert "overflow-x: auto;" in CSS
    assert "white-space: nowrap;" in CSS
    assert "width: max-content;" in CSS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.31 " in ROADMAP
    assert "## 131. v1.31" in SPEC
    assert "markdown tables in completed assistant replies" in SPEC
    assert "test_ios_markdown_table.py" in CI
    assert "markdownTable.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_copy_is_markdown_source_and_does_not_animate()
    test_ios_table_scrolls_and_copies()
    test_docs_and_openapi()
    print("ios markdown table ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
