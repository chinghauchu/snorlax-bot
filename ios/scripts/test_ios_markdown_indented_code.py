#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.48 CommonMark indented code blocks in completed assistant replies.

A run of lines indented by four or more spaces, or by a tab, renders
as a code block on a completed assistant LEFT kind=message when it is
not a paragraph continuation or list-item content. The block uses the
existing fence chrome (monospace, Copy, Wrap) and has no info string,
so it is not syntax-highlighted. Blank lines inside the block stay.
Trailing blank lines drop. An indented line cannot interrupt a
paragraph. Streaming and user messages stay unchanged. Copy on the
message still copies markdown source. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownIndentedCode.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownIndentedCode.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
BUBBLES = (ROOT / "desktop" / "src" / "assistantBubbles.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.48 CommonMark indented code blocks in completed assistant replies"


def test_parser() -> None:
    assert "v1.48" in SWIFT
    assert "static func split(_ text: String, completed: Bool)" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "static func dedentCodeLine" in SWIFT
    assert "static func contentColumns" in SWIFT
    assert "indent >= 4" in SWIFT
    assert "paragraph" in SWIFT
    assert "MarkdownList.split" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "v1.48" in DESKTOP
    assert "export function splitIndentedCode" in DESKTOP
    assert "export function dedentCodeLine" in DESKTOP
    assert "markdownListEnd" in DESKTOP
    assert "indent >= 4" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_wired_without_new_http() -> None:
    assert "MarkdownIndentedCode.split" in MARKDOWN
    assert 'language: ""' in MARKDOWN
    assert "CodeFence(" in MARKDOWN
    assert "CodeBlockWrap.blockId" in MARKDOWN
    assert "pendingBlanks" in MARKDOWN
    assert "MarkdownIndentedCode" not in PLAIN
    assert "splitIndentedCode(text, completed)" in BODY
    assert 'language=""' in BODY
    assert "FenceChrome" in BODY
    assert "pendingBlanks" in BUBBLES
    assert "copyText(reply.content)" in APP
    assert "shouldRenderMarkdown" in APP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.48 " in ROADMAP
    assert "## 148. v1.48" in SPEC
    assert "indented code blocks in completed assistant replies" in SPEC
    assert "test_ios_markdown_indented_code.py" in CI
    assert "markdownIndentedCode.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_parser()
    test_wired_without_new_http()
    print("ios markdown indented code ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
