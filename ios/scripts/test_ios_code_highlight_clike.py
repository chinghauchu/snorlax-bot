#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.09 C, C++, Java, C#, and Kotlin syntax highlighting.

A completed assistant LEFT kind=message fence tagged java, c, cpp,
c++, cs, c#, or kotlin was monochrome on main. Those info strings
now color keywords, strings, comments, and numbers. A C or C++ hash
directive at the start of a line is a keyword. Java and Kotlin text
blocks and a C# verbatim string stay strings. Unknown languages stay
plain. Streaming stays plain. Copy still copies the raw fence body.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CodeHighlight.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "codeHighlight.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v2.09 C, C++, Java, C#, and Kotlin syntax highlighting "
    "in completed assistant code blocks"
)


def test_aliases_and_tokens_match() -> None:
    for alias in (
        "java",
        "c",
        "cpp",
        "c++",
        "cc",
        "cxx",
        "hpp",
        "csharp",
        "cs",
        "c#",
        "kotlin",
        "kt",
        "kts",
    ):
        assert f'"{alias}"' in SWIFT, alias
        assert f'"{alias}"' in DESKTOP, alias
    for word in ("instanceof", "constexpr", "stackalloc", "lateinit", "nullptr"):
        assert f'"{word}"' in SWIFT, word
        assert f'"{word}"' in DESKTOP, word
    assert "private func tryDirective() -> Bool" in SWIFT
    assert "private tryDirective()" in DESKTOP
    assert "tryCLikeString" in SWIFT
    assert "tryCLikeString" in DESKTOP
    assert "consumeVerbatim" in SWIFT
    assert "consumeVerbatim" in DESKTOP
    assert "static func shouldHighlight(language: String, completed: Bool) -> Bool" in SWIFT
    assert "completed && info(for: language) != nil" in SWIFT
    assert "CodeHighlight.paint(source, language: language, completed: completed)" in MARKDOWN
    assert "CodeBlockCopy.clipboardText(source)" in MARKDOWN
    assert "shouldHighlightCode({ language, completed })" in BODY
    assert "highlightCode(source, language)" in BODY
    assert "codeBlockClipboardText(source)" in BODY
    assert "copyText(reply.content)" in APP
    assert "fetch(" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.09 " in ROADMAP
    assert "## 209. v2.09" in SPEC
    assert "test_ios_code_highlight_clike.py" in CI
    assert "codeHighlightCLike.test.ts" in PKG
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_aliases_and_tokens_match()
    test_docs_and_openapi()
    print("ios c-family highlight ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
