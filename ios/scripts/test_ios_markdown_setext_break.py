#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.83 CommonMark hard line breaks inside setext headings.

Checked CommonMark emphasis on main before this cut. Delimiter
flanking, intraword underscores versus asterisks, the rule of 3,
nested runs, unmatched delimiters, strong-plus-emph, and emphasis
inside code spans and links already match cmark-gfm. v1.67 and
v1.68 stand. Paragraph hard breaks and a setext heading inside a
list item already match via v1.41.

The unshipped gap was a setext heading prepared outside that pass.
A plain newline is a soft break. Two trailing spaces, or a
backslash before the newline, is a hard break. The line before the
underline is the end of the block. A marker inside a code span
stays in the code. Desktop and iOS share the scan.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownSetext.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownSetext.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.83 CommonMark hard line breaks inside setext headings "
    "in completed assistant replies"
)


def test_heading_breaks_are_shared() -> None:
    assert "v1.83" in SWIFT
    assert "v1.83" in DESKTOP
    assert "static func headingInlineSource(_ text: String) -> String" in SWIFT
    assert "MarkdownHardBreak.apply(escapeHeadingBlockLines(text), completed: true)" in SWIFT
    assert "private static func normalizeHeadingLine(_ line: String) -> String" in SWIFT
    assert "if spaces >= 2" in SWIFT
    assert 'replacingOccurrences(of: "\\n", with: MarkdownHardBreak.token)' not in SWIFT
    assert "export function headingInlineSource(text: string): string" in DESKTOP
    assert "return applyHardLineBreaks(escapeHeadingBlockLines(text), true)" in DESKTOP
    assert "function normalizeHeadingLine(line: string): string" in DESKTOP
    assert "if (spaces >= 2)" in DESKTOP
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "MarkdownSetext" not in PLAIN
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.83 " in ROADMAP
    assert "## 183. v1.83" in SPEC
    assert "hard line breaks inside setext headings" in SPEC
    assert "test_ios_markdown_setext_break.py" in CI
    assert "markdownSetextBreak.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_heading_breaks_are_shared()
    test_docs_ci_and_openapi()
    print("ios markdown setext break ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
