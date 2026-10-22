#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.66 GFM pipe-less table rows continue the table in completed assistant replies.

A completed LEFT kind=message keeps a body line with no unescaped
pipe as one cell, padded to the header. A blank line ends the table.
A heading, rule, quote, list, fence, indented code, raw HTML block,
or $$ line still ends it. A pipe-less header does not start a table.
Streaming stays plain text. Copy still copies the original lines.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownTable.swift").read_text(encoding="utf-8")
FOOTNOTE = (IOS / "MarkdownFootnote.swift").read_text(encoding="utf-8")
REFERENCE = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownTable.ts").read_text(encoding="utf-8")
DESKTOP_FOOTNOTE = (ROOT / "desktop" / "src" / "markdownFootnote.ts").read_text(encoding="utf-8")
DESKTOP_REFERENCE = (ROOT / "desktop" / "src" / "markdownReferenceLink.ts").read_text(
    encoding="utf-8"
)
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.66 GFM pipe-less table rows continue the table in completed assistant replies"
)


def test_wiring() -> None:
    assert "v1.66" in SWIFT
    assert "static func lineEnd" in SWIFT
    assert "splitRow(line, pipeLess: true)" in SWIFT
    assert "if pipes == 0" in SWIFT
    assert "private static func interruptsTable" in SWIFT
    assert "MarkdownList.htmlBlockInterrupts" in SWIFT
    assert "MarkdownList.htmlLazyTag" in SWIFT
    assert "/v1/" not in SWIFT
    assert "v1.66" in DESKTOP
    assert "export function markdownTableEnd" in DESKTOP
    assert "splitRow(line, true)" in DESKTOP
    assert "if (pipes === 0)" in DESKTOP
    assert "function interruptsTable" in DESKTOP
    assert "htmlBlockInterrupts" in DESKTOP
    assert "htmlLazyTag" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "markdownTableEnd" in DESKTOP_REFERENCE
    assert "MarkdownTable.lineEnd" in REFERENCE
    assert "markdownTableEnd" in DESKTOP_FOOTNOTE
    assert "MarkdownTable.lineEnd" in FOOTNOTE
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.66 " in ROADMAP
    assert "## 166. v1.66" in SPEC
    assert "GFM pipe-less table rows continue the table in completed assistant replies" in SPEC
    assert "test_ios_markdown_table_row.py" in CI
    assert "markdownTableRow.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_wiring()
    test_docs_and_openapi()
    print("ios markdown table row ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
