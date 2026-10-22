#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.67 CommonMark intraword underscores in completed assistant replies.

snake_case_name and foo_bar_baz stay literal. __init__-style dunder
identifiers stay literal. _emphasis_ and __strong__ still render.
foo*bar*baz still emphasizes. Code, links, and URLs stay literal.
Streaming stays plain text. Copy keeps markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownUnderscore.swift").read_text(encoding="utf-8")
ESCAPE = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownUnderscore.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.67 CommonMark intraword underscores stay literal in completed assistant replies"


def test_protect_keeps_streaming_and_source() -> None:
    assert "static func protect(_ text: String, completed: Bool" in SWIFT
    assert 'if !completed || text.isEmpty || !text.contains("_")' in SWIFT
    assert "dunderEnd" in SWIFT
    assert "inLinkDestination" in SWIFT
    assert "inUrlOrEmail" in SWIFT
    assert "§§SBE" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function protectIntrawordUnderscores" in DESKTOP
    assert "DUNDER_WORD_LIST" in DESKTOP
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "return false" in SWIFT
    assert "reduceMotion" in SWIFT


def test_name_lists_match() -> None:
    desktop = re.search(r'DUNDER_WORD_LIST =\n  "([^"]+)"', DESKTOP)
    ios = re.search(r'static let wordList =\n\s+"([^"]+)"', SWIFT)
    assert desktop is not None and ios is not None
    assert desktop.group(1) == ios.group(1)
    words = desktop.group(1).split(" ")
    assert words == sorted(words)
    assert "init" in words
    assert "strong" not in words


def test_ios_and_desktop_share_the_rule() -> None:
    assert "MarkdownUnderscore.protect(text, completed: true)" in ESCAPE
    assert "if !completed || text.isEmpty { return text }" in ESCAPE
    assert "protectIntrawordUnderscores(text, true)" in ESCAPE_TS
    assert "MarkdownEscape.protect(src, completed: completed)" in MARKDOWN
    assert BODY.count("protectMarkdownEscapes(mathText, completed)") == 3
    assert "copyText(reply.content)" in APP
    assert "protectIntrawordUnderscores(reply.content" not in APP
    assert "protectMarkdownEscapes(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.67 " in ROADMAP
    assert "## 167. v1.67" in SPEC
    assert "intraword underscores stay literal in completed assistant replies" in SPEC
    assert "test_ios_markdown_underscore.py" in CI
    assert "markdownUnderscore.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_protect_keeps_streaming_and_source()
    test_name_lists_match()
    test_ios_and_desktop_share_the_rule()
    test_docs_and_openapi()
    print("ios markdown underscore ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
