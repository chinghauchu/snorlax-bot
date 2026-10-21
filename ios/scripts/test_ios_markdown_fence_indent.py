#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.53 CommonMark indented fences in completed assistant replies.

A code fence indented by 1–3 spaces drops that indent from the code.
A shorter line drops all of its indent. A tab stops at the next column
of 4. The closing fence line is not part of the code. Tilde fences
follow the same rule. A fence at column 0 is unchanged. Streaming stays
plain text. Copy on the message keeps markdown source. No animation.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownFenceIndent.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownFenceIndent.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.53 CommonMark indented fences in completed assistant replies"


def test_rule_keeps_streaming_and_source() -> None:
    assert "static func dedent(_ text: String, columns: Int) -> String" in SWIFT
    assert "static func dedentLine(_ line: String, columns: Int) -> String" in SWIFT
    assert "4 - (col % 4)" in SWIFT
    assert "static func lineStart" in SWIFT
    assert "static func withoutOpeningIndent" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function dedentFencedContent" in DESKTOP
    assert "export function dedentFenceLine" in DESKTOP
    assert "4 - (col % 4)" in DESKTOP
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_uses_the_rule_and_copy_stays_source() -> None:
    assert "MarkdownFenceIndent.indent" in MARKDOWN
    assert "MarkdownFenceIndent.withoutOpeningIndent" in MARKDOWN
    assert "MarkdownFenceIndent.lineStart" in MARKDOWN
    assert "MarkdownFenceIndent.dedent" in MARKDOWN
    assert "copyText(reply.content)" in APP
    assert "dedentFencedContent(reply" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.53 " in ROADMAP
    assert "## 153. v1.53" in SPEC
    assert "indented fences in completed assistant replies" in SPEC
    assert "test_ios_markdown_fence_indent.py" in CI
    assert "markdownFenceIndent.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rule_keeps_streaming_and_source()
    test_ios_uses_the_rule_and_copy_stays_source()
    test_docs_and_openapi()
    print("ios markdown fence indent ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
