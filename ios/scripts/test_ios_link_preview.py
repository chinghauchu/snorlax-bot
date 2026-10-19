#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.35 link destination before open.

Completed assistant LEFT and user RIGHT kind=message links reveal
the full destination before they open. Desktop hovers and keyboard
focus show it in a muted status pill at the bottom-left of the chat
column; long URLs truncate in the middle. iOS long-press shows a
context menu whose header and preview are the full URL, with Open
Link and Copy Link. Copy writes the URL, not the label. A tap or
click still opens the system browser. Streaming LEFT stays as today.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
PREVIEW = (IOS / "LinkPreview.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "linkStatus.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.35 link destination before open"


def test_ios_menu_shows_the_url_and_copies_it() -> None:
    assert 'static let openLink = "Open Link"' in PREVIEW
    assert 'static let copyLink = "Copy Link"' in PREVIEW
    assert "url.absoluteString" in PREVIEW
    assert "static func destination" in PREVIEW
    assert "static func copyText" in PREVIEW
    assert "destination(url)" in PREVIEW
    assert "UIPasteboard.general.string = copyText(url)" in PREVIEW
    assert "UIMenu(title: destination" in PREVIEW
    assert "preview: .view(headerView(destination))" in PREVIEW
    assert "label.text = text" in PREVIEW
    assert "numberOfLines = 0" in PREVIEW
    assert "byTruncatingMiddle" not in PREVIEW
    assert "withAnimation" not in PREVIEW
    assert "/v1/" not in PREVIEW
    assert "menuConfigurationFor textItem" in QUOTE
    assert "guard let onLink else { return nil }" in QUOTE
    assert "case .link(let url)" in QUOTE
    assert "WebLinks.allows(url)" in QUOTE
    assert "LinkPreview.configuration(for: url, open: onLink)" in QUOTE
    assert "primaryActionFor textItem" in QUOTE
    assert "onLink(url)" in QUOTE
    assert "LinkPreview" not in PLAIN


def test_completed_bubbles_only_and_tap_still_opens() -> None:
    assert "openURL(url)" in MARKDOWN
    assert "onLink: { url in" in MARKDOWN
    assert "WebLinks.allows(url)" in MARKDOWN
    assert "QuoteSelectableText(" in MARKDOWN
    user = CHAT.split("} else if isUser {", 1)[1].split("} else {", 1)[0]
    assert "MentionLabel(" in user
    assert "links: true" in user
    left = CHAT.split("LongMessageBody(", 1)[1].split("if showCopy || showSpeak", 1)[0]
    assert "AssistantMarkdown(" in left
    assert "MidStreamPlaintextView(" in left
    assert "onLink: { url in" in COMPONENTS
    assert "openURL(url)" in COMPONENTS
    assert "WebLinks.split(text, streaming: false)" in COMPONENTS
    tool = CHAT.split("if message.isToolLine {", 1)[1].split("} else if message.isWidget", 1)[0]
    assert "LinkPreview" not in tool
    assert "preview={!streaming}" in BODY
    assert "preview={completed}" in BODY
    assert "openOsBrowser(url)" in BODY
    assert "event.preventDefault()" in BODY
    assert "linkStatusHover(id, url)" in BODY
    assert "LinkStatusPill" in APP
    assert "export function linkStatusLabel" in DESKTOP
    assert 'const ELLIPSIS = "…"' in DESKTOP
    col = APP.split('className="transcript-col"', 1)[1].split('className="composer"', 1)[0]
    assert "LinkStatusPill" in col


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.35 " in ROADMAP
    assert "## 135. v1.35" in SPEC
    assert "Open Link" in SPEC
    assert "Copy Link" in SPEC
    assert "test_ios_link_preview.py" in CI
    assert "linkStatus.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in PREVIEW
    assert "computerPane.ts" not in QUOTE


def main() -> int:
    test_ios_menu_shows_the_url_and_copies_it()
    test_completed_bubbles_only_and_tap_still_opens()
    test_docs_and_openapi()
    print("ios link preview ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
