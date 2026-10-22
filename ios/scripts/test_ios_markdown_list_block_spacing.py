#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.63 CommonMark tight list block spacing in completed assistant replies.

A tight list keeps item text flush with a nested list. A loose list
keeps 8pt of paragraph spacing there, including when the blank line
is between sibling items. A nested list keeps its own item spacing.
A bullet task row counts as one list level, so the next bullet is a
circle and depth 4+ stays a square. Streaming stays plain text. Copy
keeps markdown source. No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownLooseList.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownLooseList.ts").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.63 CommonMark tight list block spacing in completed assistant replies"


def test_gap_follows_looseness() -> None:
    assert "static func blockSpacing(listLoose: Bool?)" in SWIFT
    assert "listLoose == false ? 0 : looseSpacing" in SWIFT
    assert "var markdownListLoose: Bool?" in SWIFT
    assert "static let defaultValue: Bool? = nil" in SWIFT
    assert "if !completed || text.isEmpty { return false }" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function listBlockSpacing" in DESKTOP
    assert "if (listLoose === false) return 0" in DESKTOP
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "if depth <= 0 { return \"•\" }" in LISTS
    assert "if depth == 1 { return \"◦\" }" in LISTS
    assert "return \"▪\"" in LISTS
    assert 'if ordered { return "\\(start + index)." }' in LISTS


def test_ios_rows_pass_the_gap() -> None:
    assert "MarkdownLooseList.blockSpacing(listLoose: listLoose)" in MARKDOWN
    assert ".environment(\\.markdownListLoose, loose)" in MARKDOWN
    assert ".environment(\\.markdownListLoose, nil as Bool?)" in MARKDOWN
    task = MARKDOWN.split("struct MarkdownTaskRow", 1)[1].split("struct MarkdownSetextPieces", 1)[0]
    assert ".environment(\\.markdownListDepth, depth + 1)" in task
    assert ".environment(\\.markdownListLoose, loose)" in task
    assert 'data-loose="true"' in CSS or "[data-loose=\"true\"]" in CSS
    assert "gap: 8px;" in CSS
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.63 " in ROADMAP
    assert "## 163. v1.63" in SPEC
    assert "tight list block spacing in completed assistant replies" in SPEC
    assert "test_ios_markdown_list_block_spacing.py" in CI
    assert "markdownListBlockSpacing.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_gap_follows_looseness()
    test_ios_rows_pass_the_gap()
    test_docs_and_openapi()
    print("ios markdown list block spacing ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
