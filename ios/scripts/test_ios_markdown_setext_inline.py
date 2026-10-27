#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.93 cmark-gfm setext headings and thematic breaks.

Checked cmark-gfm 0.29.0.gfm.13 sections 4.1 and 4.3 on main
first. Leading spaces, internal spaces and tabs, a four-space
code line, mixed characters, setext versus a rule, lazy quote
and list underlines, and a rule that beats a list item already
matched. The unshipped gap was a tab stop of four columns, and
a four-column continuation that stays heading text. Desktop and
iOS share that scan.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownSetext.swift").read_text(encoding="utf-8")
SWIFT_BREAK = (IOS / "MarkdownBreak.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownSetext.ts").read_text(encoding="utf-8")
DESKTOP_BREAK = (ROOT / "desktop" / "src" / "markdownBreak.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.93 cmark-gfm setext headings and thematic breaks "
    "in completed assistant replies"
)


def test_heading_continuations_are_shared() -> None:
    assert "v1.93" in SWIFT
    assert "v1.93" in DESKTOP
    assert "v1.93" in SWIFT_BREAK
    assert "v1.93" in DESKTOP_BREAK
    assert "MarkdownIndentedCode.contentColumns" in SWIFT
    assert "columns >= 4" in SWIFT
    assert "escapeHeadingBlockLines" in SWIFT
    assert "A newline inside a code span is a space" in SWIFT
    assert "isSingleDash" in SWIFT
    assert "contentColumns" in DESKTOP
    assert "columns >= 4" in DESKTOP
    assert "escapeHeadingBlockLines" in DESKTOP
    assert "A newline inside a code span is a space" in DESKTOP
    assert "MarkdownIndentedCode.contentColumns" in SWIFT_BREAK
    assert "contentColumns(line)" in DESKTOP_BREAK
    assert "static func headingInlineSource(_ text: String) -> String" in SWIFT
    assert "MarkdownSetext.headingInlineSource" in (
        IOS / "AssistantMarkdown.swift"
    ).read_text(encoding="utf-8")
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.93 " in ROADMAP
    assert "## 193. v1.93" in SPEC
    assert "setext headings and thematic breaks" in SPEC
    assert "test_ios_markdown_setext_inline.py" in CI
    assert "markdownSetextInline.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_heading_continuations_are_shared()
    test_docs_ci_and_openapi()
    print("ios markdown setext inline ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
