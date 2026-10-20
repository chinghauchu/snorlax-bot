#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.43 CommonMark angle-bracket autolinks in completed assistant replies.

A completed LEFT kind=message renders <https://example.com/path> as a
link whose text is the URL, and <user@example.com> as a mailto link
whose text is the address. Desktop hover/focus and iOS long-press use
the existing destination preview. http(s) safe-scheme rules stand.
mailto is only the email address, with no query. Other schemes stay
literal, brackets included. Non-autolinks, spaces, and a backslash
before the bracket stay literal. Code, math, and table code cells stay
literal. Streaming stays plain. Copy still copies markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownAutolink.swift").read_text(encoding="utf-8")
LINKS = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownAutolink.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.43 CommonMark angle-bracket autolinks in completed assistant replies"


def test_prepare_and_mailto() -> None:
    assert "static func prepare(_ text: String, completed: Bool = true) -> String" in SWIFT
    assert "if !completed || text.isEmpty || !text.contains(\"<\") { return text }" in SWIFT
    assert "func unsafeAutolinkEnd" in SWIFT
    assert "WebLinks.emailAddress" in SWIFT
    assert "func safeWeb" in SWIFT
    assert 'scheme == "http" || scheme == "https"' in SWIFT
    assert "§§SBE" in SWIFT
    assert "inline code" in SWIFT or "inlineCodeRanges" in SWIFT
    assert "indented" in SWIFT
    assert "math" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "static func isMailtoEmail" in LINKS
    assert "static func emailAddress" in LINKS
    assert "if isMailtoEmail(url) { return true }" in LINKS
    assert 'scheme == "http"' in LINKS
    assert 'scheme == "https"' in LINKS
    assert "export function prepareAngleAutolinks" in DESKTOP
    assert "export function safeLinkHref" in DESKTOP
    assert "export function isSafeMailto" in DESKTOP
    assert "isSafeWebUrl" in DESKTOP
    assert "stashMarkdownText" in DESKTOP
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP


def test_wired_without_new_http() -> None:
    assert "MarkdownAutolink.prepare" in MARKDOWN
    prep = MARKDOWN.index("MarkdownAutolink.prepare")
    protect = MARKDOWN.index("MarkdownEscape.protect(src, completed: completed)")
    assert prep < protect
    assert "WebLinks.allows(url)" in MARKDOWN
    assert "LinkPreview.configuration" in QUOTE
    assert "WebLinks.allows(url)" in QUOTE
    assert "MarkdownAutolink" not in PLAIN
    assert "prepareAngleAutolinks" in BODY
    assert "safeLinkHref" in BODY
    assert "isSafeWebUrl" in BODY
    assert "linkStatusHover" in BODY
    assert "openOsBrowser" in BODY
    assert BODY.count("prepareAngleAutolinks(") == 3
    assert "copyText(reply.content)" in APP
    assert "shouldRenderMarkdown" in APP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.43 " in ROADMAP
    assert "## 143. v1.43" in SPEC
    assert "angle-bracket autolinks in completed assistant replies" in SPEC
    assert "test_ios_markdown_angle_autolink.py" in CI
    assert "markdownAutolink.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_prepare_and_mailto()
    test_wired_without_new_http()
    print("ios markdown angle autolink ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
