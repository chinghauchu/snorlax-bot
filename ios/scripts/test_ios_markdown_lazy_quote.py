#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.47 CommonMark lazy blockquote continuation in completed assistant replies.

Footnotes, ordered-list start numbers, and nested blockquotes already
shipped. This cut keeps a following paragraph line inside the open
quote when it has no `>` marker. A blank line, a margin list, an ATX
heading, a fence, or a thematic break ends the quote. Streaming stays
plain. Copy still copies markdown source. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.47 CommonMark lazy blockquote continuation in completed assistant replies"


def test_parser() -> None:
    assert "v1.47" in SWIFT
    assert "lazy continuation" in SWIFT
    assert "private static func endsLazyQuote" in SWIFT
    assert "private static func paragraphOpenAfter" in SWIFT
    assert "if !open || endsLazyQuote(current, paragraphOpen: open)" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "v1.47" in DESKTOP
    assert "function endsLazyQuote" in DESKTOP
    assert "function paragraphOpenAfter" in DESKTOP
    assert "if (!open || endsLazyQuote(current, open)) break" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_wired_without_new_http() -> None:
    assert "MarkdownQuoteTask.split(" in MARKDOWN
    assert "endsLazyQuote" not in PLAIN
    assert 'className="md-quote"' in BODY or "md-quote" in BODY
    assert "splitQuoteAndTasks(protectLazySetext(text, completed), completed)" in BODY
    assert "copyText(reply.content)" in APP
    assert "shouldRenderMarkdown" in APP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.47 " in ROADMAP
    assert "## 147. v1.47" in SPEC
    assert "lazy blockquote continuation in completed assistant replies" in SPEC
    assert "footnotes already shipped" in SPEC
    assert "test_ios_markdown_lazy_quote.py" in CI
    assert "markdownLazyQuote.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_parser()
    test_wired_without_new_http()
    print("ios markdown lazy quote ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
