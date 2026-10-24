#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.44 CommonMark setext headings in completed assistant replies.

A completed LEFT kind=message renders a line of text followed by
=== as an H1 and followed by --- as an H2, styled the same as ATX
headings. --- after a blank line stays a thematic break. --- under
a list item or a paragraph continuation follows CommonMark. A
multi-line paragraph followed by === is one heading. Underlines
inside fenced code, indented code, math, and table cells stay
literal. A lazy continuation or a backslash-escaped equals stays
literal. Streaming stays plain. Copy still copies markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownSetext.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
BREAK = (IOS / "MarkdownBreak.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownSetext.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.44 CommonMark setext headings in completed assistant replies"


def test_parser() -> None:
    assert "static func protectLazy(_ text: String, completed: Bool) -> String" in SWIFT
    assert "if !completed || text.isEmpty { return text }" in SWIFT
    assert "static func split(_ text: String, completed: Bool) -> [Block]" in SWIFT
    assert "static func literalize(_ text: String) -> String" in SWIFT
    assert "static func headingInlineSource(_ text: String) -> String" in SWIFT
    assert "MarkdownHardBreak.token" in SWIFT
    assert "return nil" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function protectLazySetext" in DESKTOP
    assert "export function splitSetextHeadings" in DESKTOP
    assert "export function literalizeSetextLines" in DESKTOP
    assert "export function headingInlineSource" in DESKTOP
    assert "export function setextAnimates" in DESKTOP
    assert "HARD_BREAK_TOKEN" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP


def test_wired_without_new_http() -> None:
    assert "MarkdownSetext.protectLazy" in MARKDOWN
    assert "MarkdownSetext.split" in MARKDOWN
    assert "MarkdownSetext.literalize" in MARKDOWN
    assert "MarkdownSetext.headingInlineSource" in MARKDOWN
    assert "headingLevel: level" in MARKDOWN
    assert "accessibilityAddTraits(.isHeader)" in MARKDOWN
    assert "level <= 1 ? metrics.heading : metrics.body" in MARKDOWN
    assert "MarkdownList.listEnd" in BREAK
    assert "htmlBlockLineEnd" in BREAK
    assert "MarkdownSetext" not in PLAIN
    assert "protectLazySetext(text, completed)" in BODY
    assert "splitSetextHeadings(text, completed)" in BODY
    assert "headingInlineSource(text)" in BODY
    assert "literalizeSetextLines(text)" in BODY
    assert 'level === 1 ? "h1" : "h2"' in BODY
    assert "copyText(reply.content)" in APP
    assert "shouldRenderMarkdown" in APP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.44 " in ROADMAP
    assert "## 144. v1.44" in SPEC
    assert "CommonMark setext headings in completed assistant replies" in SPEC
    assert "test_ios_markdown_setext.py" in CI
    assert "markdownSetext.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_parser()
    test_wired_without_new_http()
    print("ios markdown setext ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
