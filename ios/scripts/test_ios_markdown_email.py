#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.45 GFM email autolinks in completed assistant replies.

A completed LEFT kind=message renders foo@bar.baz as a mailto link
whose text is the address. mailto:foo@bar.baz keeps the prefix.
A missing dot, a plus after @, and a trailing dash or underscore
stay plain. xmpp: is not a link. Code spans, fenced code, and
indented code stay plain. User bubbles and a streaming bubble do
not gain email links. Copy still copies markdown source. No
animation. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")
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

PHRASE = "v1.45 GFM email autolinks in completed assistant replies"


def test_parser() -> None:
    assert "static func isExtendedEmail(_ address: String) -> Bool" in SWIFT
    assert "static func emailHref(_ visible: String) -> String?" in SWIFT
    assert "static func split(_ text: String, streaming: Bool, emails: Bool = false)" in SWIFT
    assert "emails: !streaming" in SWIFT
    assert "isExtendedMailto" in SWIFT
    assert "if isMailtoEmail(url) { return true }" in SWIFT
    assert "if isExtendedMailto(url) { return true }" in SWIFT
    assert 'prefix == "mailto:"' in SWIFT
    assert "visible.prefix(7).lowercased() == \"mailto:\"" in SWIFT
    assert "xmpp" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function isExtendedEmail" in DESKTOP
    assert "export function emailHref" in DESKTOP
    assert "emails?: boolean" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "copyText" not in DESKTOP


def test_wired_without_new_http() -> None:
    assert "WebLinks.applyingLinks(parsed, streaming: false)" in MARKDOWN
    assert "emails: true" not in PLAIN
    assert "WebLinks.split(text, streaming: false)" in COMPONENTS
    assert "emails: true" not in COMPONENTS
    assert "emails={completed}" in BODY
    assert "emails={emails}" in BODY
    assert "splitWebUrls(text, { streaming, emails })" in BODY
    mention = APP.split("function MentionText", 1)[1][:900]
    assert "emails" not in mention
    assert "copyText(reply.content)" in APP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.45 " in ROADMAP
    assert "## 145. v1.45" in SPEC
    assert "GFM email autolinks in completed assistant replies" in SPEC
    assert "test_ios_markdown_email.py" in CI
    assert "markdownEmail.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_parser()
    test_wired_without_new_http()
    print("ios markdown email ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
