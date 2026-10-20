#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.37 syntax highlighting in completed assistant code blocks.

A completed LEFT kind=message fence with a recognized language
colors keywords, strings, comments, and numbers. Unlabeled and
unknown languages stay plain. The tokenizer is local. Streaming
stays plain. Copy still copies the raw fence body. Wrap and the
language label stay. Mermaid and TeX math are unchanged.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CodeHighlight.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "codeHighlight.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.37 syntax highlighting in completed assistant code blocks"


def test_tokenizer_is_local_and_gated() -> None:
    assert "static func shouldHighlight(language: String, completed: Bool) -> Bool" in SWIFT
    assert "completed && info(for: language) != nil" in SWIFT
    assert "static func paint(_ source: String, language: String, completed: Bool) -> AttributedString" in SWIFT
    assert "return AttributedString(source)" in SWIFT
    assert "uiKit.foregroundColor" in SWIFT
    assert "static func animates(reduceMotion: Bool) -> Bool" in SWIFT
    assert "return false" in SWIFT
    assert "#9aa8e8" in SWIFT
    assert "#3d4f99" in SWIFT
    assert "#8fbf9a" in SWIFT
    assert "#2f6b45" in SWIFT
    assert "#8b8d94" in SWIFT
    assert "#6b6d75" in SWIFT
    assert "#c4a574" in SWIFT
    assert "#8a5a22" in SWIFT
    for word in ("def", "return", "select", "func", "package", "true"):
        assert f'"{word}"' in SWIFT
    for lang in ("python", "tsx", "json", "bash", "swift", "go", "rust", "yaml", "html", "css", "sql", "diff"):
        assert f'"{lang}"' in SWIFT
    assert "fetch(" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function shouldHighlightCode" in DESKTOP
    assert "export function highlightCode" in DESKTOP
    assert "export function codeHighlightAnimates" in DESKTOP
    assert "return false" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "http://" not in DESKTOP
    assert "https://" not in DESKTOP


def test_ios_fence_paints_completed_source() -> None:
    fence = MARKDOWN.split("struct CodeFence", 1)[1].split("struct FenceBar", 1)[0]
    source = MARKDOWN.split("struct FenceSource", 1)[1].split("struct MathBlock", 1)[0]
    assert "FenceSource(source: source, wrapped: wrapped, language: language, completed: completed)" in fence
    assert "CodeHighlight.paint(source, language: language, completed: completed)" in source
    assert "ChatFind.paint" in source
    assert 'Text(language)' in MARKDOWN
    assert "CodeBlockCopy.clipboardText(source)" in MARKDOWN
    assert "CodeBlockWrap.label(wrapped: wrapped)" in MARKDOWN
    assert "showsWrap: failed" in MARKDOWN
    assert "codeBlockClipboardText(source)" in BODY
    assert "codeBlockWrapClass(wrapOn)" in BODY
    assert "shouldHighlightCode({ language, completed })" in BODY
    assert "highlightCode(source, language)" in BODY
    assert 'className="md-fence-lang"' in BODY
    assert "--tok-keyword: #9aa8e8" in CSS
    assert "--tok-keyword: #3d4f99" in CSS
    assert "--tok-string: #8fbf9a" in CSS
    assert "--tok-string: #2f6b45" in CSS
    assert ".md-tok-keyword" in CSS
    assert ".md-tok-string" in CSS
    assert ".md-tok-comment" in CSS
    assert ".md-tok-number" in CSS
    assert "copyText(reply.content)" in APP
    assert "transition: none" in CSS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.37 " in ROADMAP
    assert "## 137. v1.37" in SPEC
    assert "test_ios_code_highlight.py" in CI
    assert "codeHighlight.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_tokenizer_is_local_and_gated()
    test_ios_fence_paints_completed_source()
    test_docs_and_openapi()
    print("ios code highlight ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
