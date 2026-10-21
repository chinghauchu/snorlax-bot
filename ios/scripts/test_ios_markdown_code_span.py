#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.52 CommonMark multi-backtick code spans in completed assistant replies.

A code span opened by N backticks closes at the next run of exactly N.
``code with ` inside`` renders as code and the delimiter backticks are
hidden. A line of three or more backticks whose info string contains a
backtick stays inline code, not a fence. A blank line inside the span
stays in that bubble. An unmatched opener stays literal. Streaming stays
plain text. Copy keeps markdown source. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownCodeSpan.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownCodeSpan.ts").read_text(encoding="utf-8")
MATH = (ROOT / "desktop" / "src" / "math.ts").read_text(encoding="utf-8")
BUBBLES = (ROOT / "desktop" / "src" / "assistantBubbles.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.52 CommonMark multi-backtick code spans in completed assistant replies"


def test_rule_keeps_streaming_and_source() -> None:
    assert "static func fenceInfoAllowsOpen(marker: String, info: String)" in SWIFT
    assert 'marker.hasPrefix("`"), info.contains("`")' in SWIFT
    assert "static func spans(in text: String)" in SWIFT
    assert "if !matched { index += length }" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function codeSpanRanges" in DESKTOP
    assert "export function offsetInsideCodeSpan" in DESKTOP
    assert "if (!matched) i += n" in MATH
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_and_desktop_share_the_rule() -> None:
    assert "MarkdownCodeSpan.spans(in: joined)" in MARKDOWN
    assert "MarkdownCodeSpan.fenceInfoAllowsOpen" in MARKDOWN
    assert "MarkdownCodeSpan.contains(lineStarts[index], codeSpans)" in MARKDOWN
    assert "insideCodeSpan" in BUBBLES
    assert "fenceInfoAllowsOpen" in BUBBLES
    assert "copyText(reply.content)" in APP
    assert "codeSpanRanges(reply" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.52 " in ROADMAP
    assert "## 152. v1.52" in SPEC
    assert "multi-backtick code spans in completed assistant replies" in SPEC
    assert "test_ios_markdown_code_span.py" in CI
    assert "markdownCodeSpan.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rule_keeps_streaming_and_source()
    test_ios_and_desktop_share_the_rule()
    test_docs_and_openapi()
    print("ios markdown code span ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
