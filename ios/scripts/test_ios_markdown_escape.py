#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.40 CommonMark backslash escapes and HTML character references.

A completed LEFT kind=message renders a backslash before ASCII
punctuation as that character, and does not let it start emphasis,
links, lists, or other markdown. Named entities and decimal or hex
numeric references decode. Unknown entities stay literal. Invalid
and zero code points become U+FFFD. Code spans and fenced code stay
literal. Math delimiters are recognized first. Escaped text is never
HTML. Streaming stays plain. Copy still copies markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
ENTITIES = (IOS / "MarkdownCmarkEntities.swift").read_text(encoding="utf-8")
DESKTOP_ENTITIES = (ROOT / "desktop" / "src" / "markdownCmarkEntities.ts").read_text(
    encoding="utf-8"
)
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.40 CommonMark backslash escapes and HTML character references "
    "in completed assistant replies"
)
NAMES = (
    "amp",
    "lt",
    "gt",
    "quot",
    "apos",
    "nbsp",
    "copy",
    "reg",
    "trade",
    "hellip",
    "mdash",
    "ndash",
    "lsquo",
    "rsquo",
    "ldquo",
    "rdquo",
    "times",
    "divide",
    "deg",
    "plusmn",
    "middot",
    "bull",
    "euro",
    "pound",
    "yen",
    "cent",
    "sect",
    "para",
    "larr",
    "rarr",
    "uarr",
    "darr",
    "check",
    "checkmark",
)


def test_protect_skips_streaming_code_and_keeps_source() -> None:
    assert "static func protect(_ text: String, completed: Bool = true) -> String" in SWIFT
    assert 'if !completed || text.isEmpty { return text }' in SWIFT
    assert "private static func readReference" in SWIFT
    assert "private static func readNumeric" in SWIFT
    assert "private static func fenceRanges" in SWIFT
    assert "private static func inlineCodeRanges" in SWIFT
    assert "private static func indentedCodeRanges" in SWIFT
    assert "func restoreString" in SWIFT
    assert "\\u{FFFD}" in SWIFT
    assert "ASCII punctuation" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function protectMarkdownEscapes" in DESKTOP
    assert "if (!completed || !text) return text;" in DESKTOP
    assert "export function restoreMarkdownEscapes" in DESKTOP
    assert "function readReference" in DESKTOP
    assert "function indentedCodeRanges" in DESKTOP
    assert "\\uFFFD" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "MarkdownCmarkEntities.named" in SWIFT
    assert "CMARK_NAMED_ENTITIES" in DESKTOP
    for name in NAMES:
        assert f'"{name}":' in ENTITIES
        assert f'"{name}":' in DESKTOP_ENTITIES


def test_math_before_escape_and_text_not_html() -> None:
    assert "MarkdownSplit.splitInlineMath(source)" in MARKDOWN
    assert "MarkdownEscape.protect(src, completed: completed)" in MARKDOWN
    assert "MarkdownEscape.restore(parsed)" in MARKDOWN
    assert MARKDOWN.index("MarkdownSplit.splitInlineMath(source)") < MARKDOWN.index(
        "MarkdownEscape.protect(src, completed: completed)"
    )
    assert MARKDOWN.index("WebLinks.applyingLinks(parsed, streaming: false)") < MARKDOWN.index(
        "MarkdownEscape.restore(parsed)"
    )
    assert MARKDOWN.index("MarkdownEscape.restore(parsed)") < MARKDOWN.index(
        "dropUnsafeLinks(&parsed)"
    )
    assert "protectMarkdownEscapes(mathText, completed)" in BODY
    assert BODY.index("extractMath(text)") < BODY.index("protectMarkdownEscapes(mathText, completed)")
    assert "restoreMarkdownEscapes(href ?? \"\")" in BODY
    assert "copyText(reply.content)" in APP
    assert "protectMarkdownEscapes(reply.content" not in APP
    assert "withAnimation" not in SWIFT
    assert "computerPane.ts" not in SWIFT


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.40 " in ROADMAP
    assert "## 140. v1.40" in SPEC
    assert "backslash escapes and HTML character references" in SPEC
    assert "test_ios_markdown_escape.py" in CI
    assert "markdownEscape.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in DESKTOP


def main() -> int:
    test_protect_skips_streaming_code_and_keeps_source()
    test_math_before_escape_and_text_not_html()
    test_docs_and_openapi()
    print("ios markdown escape ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
