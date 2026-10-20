#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.46 CommonMark link titles in completed assistant replies.

A completed LEFT kind=message shows a CommonMark link title as the
link's hover tooltip and accessibility hint. Desktop sets the anchor
title and aria-description. iOS keeps the long-press destination
preview and uses the title as that preview's accessibility hint and
tooltip line. A plain link has no tooltip. Streaming stays plain.
Copy still copies markdown source. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownLinkTitle.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PREVIEW = (IOS / "LinkPreview.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownLinkTitle.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.46 CommonMark link titles in completed assistant replies"


def test_parser() -> None:
    assert "static func hint(_ title: String?, completed: Bool) -> String" in SWIFT
    assert 'if !completed { return "" }' in SWIFT
    assert "static func annotate(_ text: inout AttributedString, source: String, completed: Bool)" in SWIFT
    assert "if !completed || source.isEmpty { return }" in SWIFT
    assert "snorlaxLinkTitle" in SWIFT
    assert "static func consumePreviewHint() -> String?" in SWIFT
    assert "static var previewHint: String?" in SWIFT
    assert "WebLinks.url" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "export function linkTitleHint" in DESKTOP
    assert "export function renderedInlineLinks" in DESKTOP
    assert "export function linkTitleAnimates" in DESKTOP
    assert "aria-description" in BODY
    assert "title={hint || undefined}" in BODY
    assert "/v1/" not in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP


def test_wired_without_new_http() -> None:
    assert "MarkdownLinkTitle.annotate" in MARKDOWN
    assert "MarkdownLinkTitle" not in PLAIN
    assert "MarkdownLinkTitle.previewHint" in QUOTE
    assert "LinkPreview.configuration(for: url, open: onLink)" in QUOTE
    assert ".snorlaxLinkTitle" in QUOTE
    assert "accessibilityHint = hint" in PREVIEW
    assert "titleLabel.text = hint" in PREVIEW
    assert "label.text = text" in PREVIEW
    assert "preview: .view(headerView(destination))" in PREVIEW
    assert "UIMenu(title: destination" in PREVIEW
    assert "url.absoluteString" in PREVIEW
    assert "withAnimation" not in PREVIEW
    assert "copyText(reply.content)" in APP
    assert "shouldRenderMarkdown" in APP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.46 " in ROADMAP
    assert "## 146. v1.46" in SPEC
    assert "CommonMark link titles in completed assistant replies" in SPEC
    assert "test_ios_markdown_link_title.py" in CI
    assert "markdownLinkTitle.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_parser()
    test_wired_without_new_http()
    print("ios markdown link title ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
