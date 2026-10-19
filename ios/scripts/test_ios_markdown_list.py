#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.36 ordered list start numbers and nested lists in completed assistant replies.

A completed LEFT kind=message keeps an ordered list's start number
(3. / 4. after a paragraph or a code fence) and draws a nested list
indented with its own marker. Streaming stays the markdown string.
Copy controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.36 ordered list start numbers and nested lists in completed assistant replies"


def test_split_keeps_streaming_and_source() -> None:
    assert "static func split(_ text: String, completed: Bool)" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "static func marker(ordered: Bool, start: Int, index: Int, depth: Int)" in SWIFT
    assert "start + index" in SWIFT
    assert 'return "•"' in SWIFT
    assert 'return "◦"' in SWIFT
    assert 'return "▪"' in SWIFT
    assert 'return "Bullet"' in SWIFT
    assert "return nil" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function splitMarkdownLists" in DESKTOP
    assert "export function listAnimates" in DESKTOP
    assert "export function listMarker" in DESKTOP
    assert "return false" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_lists_are_marked_and_static() -> None:
    block = MARKDOWN.split("struct MarkdownListBlock", 1)[1].split("struct MarkdownRule", 1)[0]
    assert "MarkdownList.split(source, completed: completed)" in MARKDOWN
    assert "MarkdownList.marker(" in block
    assert "MarkdownList.markerLabel(" in block
    assert "MarkdownList.animation(reduceMotion: reduceMotion)" in block
    assert "markdownListDepth" in block
    assert "HStack(alignment: .top, spacing: 8)" in block
    assert ".environment(\\.markdownListDepth, depth + 1)" in block
    assert "withAnimation" not in block
    assert "ol: ({ start, children })" in BODY
    assert "<ol start={start}>" in BODY
    assert "list-style: disc outside;" in CSS
    assert "list-style: decimal outside;" in CSS
    assert "list-style-type: circle;" in CSS
    assert "list-style-type: square;" in CSS
    assert "padding-left: 1.2em;" in CSS
    assert "copyText(reply.content)" in APP
    assert "tableClipboardText(table.source)" in BODY
    assert "codeBlockClipboardText(source)" in BODY
    assert "byCharWrapping" in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.36 " in ROADMAP
    assert "## 136. v1.36" in SPEC
    assert "ordered list start numbers and nested lists in completed assistant replies" in SPEC
    assert "test_ios_markdown_list.py" in CI
    assert "markdownList.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_split_keeps_streaming_and_source()
    test_ios_lists_are_marked_and_static()
    test_docs_and_openapi()
    print("ios markdown list ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
