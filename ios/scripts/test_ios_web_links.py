#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.82 bare http(s) links in chat bubbles.

Bare http:// and https:// in user-RIGHT and assistant-LEFT message text
are links on desktop and iOS. A URL still growing at the end of a
mid-stream bubble stays plain. Trailing period, comma, closing paren, or
quote stays outside the link. Inline code and fenced code stay plain.
javascript:, file:, and other schemes stay plain. Existing markdown
links stay. Desktop opens the system browser. iOS uses the system
handler. Tool lines, cards, and file chips stay plain. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LINKS = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "linkify.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"


def test_schemes_punctuation_code_and_stream() -> None:
    assert "https?://" in LINKS
    assert "https?:" in DESKTOP
    assert "https?:\\/\\/" in DESKTOP
    assert 'scheme == "http"' in LINKS
    assert 'scheme == "https"' in LINKS
    assert 'url.protocol !== "http:"' in DESKTOP
    assert 'url.protocol !== "https:"' in DESKTOP
    assert "javascript:" not in LINKS.split("allows", 1)[1][:400]
    for punct in (".", ",", ")", '"', "'"):
        assert punct in LINKS
        assert punct in DESKTOP
    assert "streaming && rawEnd == text.endIndex" in LINKS
    assert "streaming && idx + raw.length === text.length" in DESKTOP
    assert "func codeRanges" in LINKS
    assert "function codeRanges" in DESKTOP
    assert 'text[index] == "`"' in LINKS
    assert 'text[i] === "`"' in DESKTOP
    assert "readOpeningFence" in LINKS
    assert "readOpeningFence" in DESKTOP
    assert "findInlineClose" in LINKS
    assert "findInlineClose" in DESKTOP
    assert "computerPane.ts" not in LINKS
    assert "/v1/" not in LINKS


def test_user_and_assistant_bubbles_linkify() -> None:
    assert "WebLinks.split(text, streaming: false)" in COMPONENTS
    assert "WebLinks.allows(url)" in COMPONENTS
    assert 'url.scheme?.lowercased() == "https"' not in COMPONENTS
    user = CHAT.split("} else if isUser {", 1)[1].split("} else {", 1)[0]
    assert "MentionLabel(" in user
    assert "links: true" in user
    assert "WebLinks" not in user
    assert "LongMessageBody" not in user
    left = CHAT.split("LongMessageBody(", 1)[1].split("if showCopy || showSpeak", 1)[0]
    assert "AssistantMarkdown(" in left
    assert "MidStreamPlaintextView(" in left
    assert "WebLinks.applyingLinks(parsed, streaming: false)" in MARKDOWN
    assert "WebLinks.allows(url)" in MARKDOWN
    assert 'url.scheme?.lowercased() != "https"' not in MARKDOWN
    assert "inlinePresentationIntent, intent.contains(.code)" in LINKS
    assert ".codeBlock" in LINKS
    assert "WebLinks.attributed(text, streaming: true)" in PLAIN
    assert "WebLinks.allows(url)" in PLAIN
    assert "AttributedString(markdown:" not in PLAIN
    assert "shouldRenderMarkdown" in PLAIN
    fence = MARKDOWN.split("private struct FenceSource", 1)[1].split("private struct MathBlock", 1)[0]
    assert "WebLinks" not in fence
    assert "ChatFind.paint" in fence


def test_desktop_wiring_matches() -> None:
    assert "isSafeWebUrl" in BODY
    assert "splitWebUrls" in BODY
    assert "openOsBrowser" in BODY
    assert "function InlineCode" in BODY
    assert "child.type === InlineCode" in BODY
    assert "child.type === MdLink" in BODY
    user_start = APP.index('className="bubble user"')
    user = APP[user_start : APP.index("assistant-md", user_start)]
    assert "MentionText" in user
    assert "links" in user
    assert "MarkdownBody" not in user
    plain_start = APP.index('className="assistant-plain"')
    plain = APP[plain_start : APP.index("showAssistantCopy", plain_start)]
    assert "HttpsText" in plain
    assert "streaming" in plain
    assert "MarkdownBody" not in plain
    tool_start = APP.index(") : isToolLine(message) ? (")
    tool = APP[tool_start : APP.index("isWidget(message)", tool_start)]
    assert "FindText" in tool
    assert "HttpsText" not in tool
    assert "splitWebUrls" not in tool


def test_tool_cards_unchanged_and_no_new_http() -> None:
    tool = CHAT.split("if message.isToolLine {", 1)[1].split("} else if message.isWidget", 1)[0]
    assert "FindHighlighted" in tool
    assert "WebLinks" not in tool
    assert "MentionLabel" not in tool
    widget = CHAT.split("} else if message.isWidget", 1)[1].split("} else if message.isConnect", 1)[0]
    assert "WidgetCardView" in widget
    assert "WebLinks" not in widget
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "v0.82 bare http(s) links" in ROADMAP
    assert "/ v0.82 " in ROADMAP
    assert not PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in PLAIN
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    tests = [
        test_schemes_punctuation_code_and_stream,
        test_user_and_assistant_bubbles_linkify,
        test_desktop_wiring_matches,
        test_tool_cards_unchanged_and_no_new_http,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}", file=sys.stderr)
    if failed:
        print(f"{failed} failed", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
