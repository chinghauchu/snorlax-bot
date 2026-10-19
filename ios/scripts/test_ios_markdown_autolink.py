#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.34 www autolinks in completed assistant replies.

Completed LEFT kind=message bare www.example.com renders as a link
the way a GFM autolink literal does. The visible text stays www…;
the opened URL is http:// plus that text, in the system browser.
v0.82 https:// links stay. Trailing punctuation stays outside.
Balanced parentheses stay inside. Inline code and fenced code stay
plain. Streaming keeps the end-of-buffer rule. Copy keeps markdown
source. No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LINKS = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "linkify.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.34 www autolinks in completed assistant replies"


def test_www_autolink_matches_gfm_and_opens_http() -> None:
    assert 'raw.hasPrefix("www.") ? "http://" + raw' in LINKS
    assert "func splitWww" in LINKS
    assert "func checkDomain" in LINKS
    assert "func wwwBoundary" in LINKS
    assert "func autolinkDelim" in LINKS
    assert 'prev == "*" || prev == "_" || prev == "~" || prev == "("' in LINKS
    assert "streaming && rawEnd == chars.count" in LINKS
    assert "https?://" in LINKS
    assert 'scheme == "http"' in LINKS
    assert 'scheme == "https"' in LINKS
    assert "export function linkHref" in DESKTOP
    assert 'return `http://${visible}`' in DESKTOP
    assert "function splitWww" in DESKTOP
    assert "function checkDomain" in DESKTOP
    assert 'prev === "*" || prev === "_" || prev === "~" || prev === "("' in DESKTOP
    assert "https?:\\/\\/" in DESKTOP
    assert "function splitHttp" in DESKTOP
    assert "func splitHttp" in LINKS
    assert "/v1/" not in LINKS
    assert "withAnimation" not in LINKS
    assert "UIPasteboard" not in LINKS


def test_completed_replies_link_and_copy_stays_source() -> None:
    assert "WebLinks.applyingLinks(parsed, streaming: false)" in MARKDOWN
    assert "WebLinks.allows(url)" in MARKDOWN
    assert "openURL(url)" in MARKDOWN
    assert "inlinePresentationIntent, intent.contains(.code)" in LINKS
    assert ".codeBlock" in LINKS
    assert "func codeRanges" in LINKS
    assert "function codeRanges" in DESKTOP
    left = CHAT.split("LongMessageBody(", 1)[1].split("if showCopy || showSpeak", 1)[0]
    assert "AssistantMarkdown(" in left
    assert "MidStreamPlaintextView(" in left
    assert "WebLinks.attributed(text, streaming: true)" in PLAIN
    assert "AttributedString(markdown:" not in PLAIN
    fence = MARKDOWN.split("private struct FenceSource", 1)[1].split("private struct MathBlock", 1)[0]
    assert "WebLinks" not in fence
    assert "href={linkHref(piece.value)}" in BODY
    assert "openOsBrowser" in BODY
    assert "event.preventDefault()" in BODY
    assert "child.type === MdLink" in BODY
    assert "child.type === InlineCode" in BODY
    assert "copyText(reply.content)" in APP
    assert "tableClipboardText(table.source)" in BODY
    assert "codeBlockClipboardText(source)" in BODY
    user = CHAT.split("} else if isUser {", 1)[1].split("} else {", 1)[0]
    assert "links: true" in user
    tool = CHAT.split("if message.isToolLine {", 1)[1].split("} else if message.isWidget", 1)[0]
    assert "WebLinks" not in tool
    assert "WebLinks.split(text, streaming: false)" in COMPONENTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.34 " in ROADMAP
    assert "v0.82 bare http(s) links" in ROADMAP
    assert "## 134. v1.34" in SPEC
    assert "www autolinks in completed assistant replies" in SPEC
    assert "test_ios_markdown_autolink.py" in CI
    assert "linkify.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in LINKS
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_www_autolink_matches_gfm_and_opens_http()
    test_completed_replies_link_and_copy_stays_source()
    test_docs_and_openapi()
    print("ios markdown autolink ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
