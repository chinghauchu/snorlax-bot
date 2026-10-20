#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.42 CommonMark inline images in completed assistant replies.

A completed LEFT kind=message renders ![alt](https://...) and a
reference image rewritten by v1.39 as an inline image sized to
the bubble, keeping aspect ratio. Alt is the accessibility
label. Title is the tooltip. Loading shows a muted placeholder.
Failure shows the alt, or the URL when alt is empty, as muted
link-like text. A tap opens the v0.79 lightbox. An image that
is the whole link opens that link instead. Only http(s) and
/v1/attachments or /v1/images load. Other schemes stay literal.
Code, math, and table code cells stay literal. Streaming stays
plain. Copy still copies markdown source. No animation. No new
HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownImage.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownImage.ts").read_text(encoding="utf-8")
VIEW = (ROOT / "desktop" / "src" / "markdownImageView.tsx").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.42 CommonMark inline images in completed assistant replies"


def test_split_and_render() -> None:
    assert "static func split(_ text: String, completed: Bool = true) -> [Piece]" in SWIFT
    assert "static func sourceKind(_ raw: String) -> Kind" in SWIFT
    assert "case remote" in SWIFT
    assert "case attachment" in SWIFT
    assert "case literal" in SWIFT
    assert "/v1/attachments/" in SWIFT
    assert "/v1/images/" in SWIFT
    assert "struct MarkdownInlineImage" in SWIFT
    assert "tertiarySystemFill" in SWIFT
    assert "ImageLightbox.Target" in SWIFT
    assert "markdownImageOpen" in SWIFT
    assert "WebLinks.allows" in SWIFT
    assert "if !completed || text.isEmpty { return [.text(text)] }" in SWIFT
    assert "inline code" in SWIFT or "inlineCodeRanges" in SWIFT
    assert "indented" in SWIFT
    assert "math" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "export function splitMarkdownImages" in DESKTOP
    assert "export function imageSourceKind" in DESKTOP
    assert "export function neutralizeUnsafeImages" in DESKTOP
    assert "md-image-pending" in VIEW
    assert "md-image-fallback" in VIEW
    assert "resolveMediaUrl" in VIEW
    assert "onOpenImage" in VIEW


def test_wired_without_new_http() -> None:
    assert "MarkdownImage.split" in MARKDOWN
    assert "MarkdownInlineImage" in MARKDOWN
    assert "markdownImageOpen" in CHAT
    assert "neutralizeUnsafeImages" in BODY
    assert "markdownImageNode" in BODY
    assert "onOpenImage={openImageLightbox}" in APP
    assert "session={session}" in APP
    assert "copyText(reply.content)" in APP
    assert "withAnimation" not in SWIFT
    assert "computerPane.ts" not in DESKTOP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.42 " in ROADMAP
    assert "## 142. v1.42" in SPEC
    assert "lightbox" in SPEC
    assert "test_ios_markdown_image.py" in CI
    assert "markdownImage.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()


def main() -> int:
    test_split_and_render()
    test_wired_without_new_http()
    test_docs_and_openapi()
    print("ios markdown image ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
