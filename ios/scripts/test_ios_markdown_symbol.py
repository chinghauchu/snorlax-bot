#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.68 CommonMark Unicode symbols count as emphasis punctuation.

A BMP symbol such as £ © ± ™ is punctuation for * flanking, so
*£*bravo, *±*1, a*©*b, and **£**bravo keep their asterisks.
*£50*, (*©*), **©** notice, *foo*, and *😀*bravo still emphasize.
Code, link destinations, and URLs stay literal. Streaming stays
plain text. Copy keeps markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownSymbol.swift").read_text(encoding="utf-8")
ESCAPE = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownSymbol.ts").read_text(encoding="utf-8")
ESCAPE_TS = (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(encoding="utf-8")
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
    "v1.68 CommonMark Unicode symbols count as emphasis punctuation "
    "in completed assistant replies"
)


def test_protect_keeps_streaming_and_source() -> None:
    assert "static func protect(_ text: String, completed: Bool" in SWIFT
    assert "if !completed || text.isEmpty" in SWIFT
    assert "isBmpSymbol" in SWIFT
    assert "currencySymbol" in SWIFT
    assert "0xFFFF" in SWIFT
    assert "0x7F" in SWIFT
    assert "0x7f" in DESKTOP
    assert "inLinkDestination" in SWIFT
    assert "inUrlOrEmail" in SWIFT
    assert "§§SBE" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function protectSymbolFlanks" in DESKTOP
    assert "isBmpSymbol" in DESKTOP
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "return false" in SWIFT
    assert "reduceMotion" in SWIFT


def test_ios_and_desktop_share_the_rule() -> None:
    assert "MarkdownSymbol.protect(underscored, completed: true)" in ESCAPE
    assert "if !completed || text.isEmpty { return text }" in ESCAPE
    assert "protectSymbolFlanks(protectIntrawordUnderscores(text, true), true)" in ESCAPE_TS
    assert "MarkdownEscape.protect(src, completed: completed)" in MARKDOWN
    assert BODY.count("protectMarkdownEscapes(mathText, completed)") == 3
    assert "copyText(reply.content)" in APP
    assert "protectSymbolFlanks(reply.content" not in APP
    assert "protectMarkdownEscapes(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.68 " in ROADMAP
    assert "## 168. v1.68" in SPEC
    assert "Unicode symbols count as emphasis punctuation" in SPEC
    assert "test_ios_markdown_symbol.py" in CI
    assert "markdownSymbol.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_protect_keeps_streaming_and_source()
    test_ios_and_desktop_share_the_rule()
    test_docs_and_openapi()
    print("ios markdown symbol ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
