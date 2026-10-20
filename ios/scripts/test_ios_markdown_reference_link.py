#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.39 CommonMark reference-style links in completed assistant replies.

A completed LEFT kind=message resolves [text][ref], [ref][], and
[ref] against a [ref]: url definition anywhere in that message.
Labels match case-insensitively after whitespace is collapsed.
Resolved links are inline links, so styling, the destination
preview, and http(s) safe schemes stay as they are. Definition
lines are not shown. Unresolved references stay literal. [^1]
stays a footnote. Task lists, tables, and code stay literal.
Streaming stays plain. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownReferenceLink.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.39 CommonMark reference-style links in completed assistant replies"


def test_resolve_keeps_streaming_and_source() -> None:
    assert "static func resolve(_ text: String, completed: Bool) -> String" in SWIFT
    assert 'if !completed || text.isEmpty || !text.contains("[") { return text }' in SWIFT
    assert "if collected.cuts.isEmpty { return text }" in SWIFT
    assert "private static func isFootnoteLabel" in SWIFT
    assert "private static func isTaskMarker" in SWIFT
    assert "private static func parseDefinition" in SWIFT
    assert "private static func applyReferences" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function resolveReferenceLinks" in DESKTOP
    assert "if (!completed || !text || !text.includes(\"[\")) return text;" in DESKTOP
    assert "if (collected.cuts.length === 0) return text;" in DESKTOP
    assert "function isFootnoteLabel" in DESKTOP
    assert "function isTaskMarker" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_resolves_before_footnotes_and_keeps_links() -> None:
    assert "MarkdownReferenceLink.resolve(message.displayContent, completed: completed)" in CHAT
    assert "MarkdownFootnote.extract(linked, completed: completed)" in CHAT
    assert "MarkdownFootnote.extract(referenceBody, completed: completed)" in CHAT
    assert "MarkdownSplit.bubbles(in: message.displayContent, completed: completed)" in CHAT
    assert "resolveReferenceLinks(body, completed)" in APP
    assert "resolveReferenceLinks(replyBody, completed)" in APP
    assert "extractFootnotes(linked, completed)" in APP
    assert "href={href} preview={completed}" in BODY
    assert 'className="md-link"' in BODY
    assert "isSafeWebUrl" in BODY
    assert "LinkPreview.configuration" in (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
    assert "WebLinks.allows(url)" in (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
    assert "withAnimation" not in SWIFT
    assert "computerPane.ts" not in SWIFT


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.39 " in ROADMAP
    assert "## 139. v1.39" in SPEC
    assert "reference-style links in completed assistant replies" in SPEC
    assert "test_ios_markdown_reference_link.py" in CI
    assert "markdownReferenceLink.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in DESKTOP


def main() -> int:
    test_resolve_keeps_streaming_and_source()
    test_ios_resolves_before_footnotes_and_keeps_links()
    test_docs_and_openapi()
    print("ios markdown reference link ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
