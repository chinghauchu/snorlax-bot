#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.55 GFM table alignment and escaped pipes in completed assistant replies.

A completed LEFT kind=message pipe table aligns columns from the
delimiter row: :--- left, :---: center, ---: right. A backslash-pipe
inside a cell stays in that cell. Inside inline code the backslash is
dropped so the chip shows a literal pipe. Streaming stays the markdown
string. Copy controls keep markdown source.
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

PHRASE = "v1.55 GFM table alignment and escaped pipes in completed assistant replies"


def test_alignment_and_escaped_pipe() -> None:
    assert "v1.55" in SWIFT
    assert 'chars[index + 1] == "|"' in SWIFT
    assert 'current.append("|")' in SWIFT
    assert "if left && right { align.append(.center) }" in SWIFT
    assert "else if right { align.append(.right) }" in SWIFT
    assert "else { align.append(.left) }" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "v1.55" in DESKTOP
    assert 'body[i + 1] ?? "") === "|"' in DESKTOP
    assert 'current += "|"' in DESKTOP
    assert 'align.push("center")' in DESKTOP
    assert 'align.push("right")' in DESKTOP
    assert 'align.push("left")' in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "gridColumnAlignment(columnAlign(column))" in MARKDOWN
    assert "case .left: return .leading" in MARKDOWN
    assert "case .center: return .center" in MARKDOWN
    assert "case .right: return .trailing" in MARKDOWN
    assert "MarkdownTableCopy.clipboardText(table.source)" in MARKDOWN
    assert "tableAlignClass(table.align[index])" in BODY
    assert 'return "md-table-left"' in BODY
    assert 'return "md-table-center"' in BODY
    assert 'return "md-table-right"' in BODY
    assert "text-align: left;" in CSS
    assert "text-align: center;" in CSS
    assert "text-align: right;" in CSS
    assert "tableClipboardText(table.source)" in BODY


def test_copy_stays_source() -> None:
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.55 " in ROADMAP
    assert "## 155. v1.55" in SPEC
    assert "GFM table alignment and escaped pipes in completed assistant replies" in SPEC
    assert "test_ios_markdown_table_align.py" in CI
    assert "markdownTableAlign.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_alignment_and_escaped_pipe()
    test_copy_stays_source()
    test_docs_and_openapi()
    print("ios markdown table align ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
