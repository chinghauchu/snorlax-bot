#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.32 blockquotes and task lists in completed assistant replies.

A completed LEFT kind=message renders GFM blockquotes with a muted
left rule and indent, including nested quotes, and GFM task lists as
read-only checkbox glyphs. Checked items are muted. Streaming stays
the markdown string. Copy controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.32 blockquotes and task lists in completed assistant replies"


def _slice(text: str, start: str, end: str) -> str:
    i = text.find(start)
    assert i >= 0, start
    j = text.find(end, i + len(start))
    assert j > i, end
    return text[i:j]


def test_split_keeps_streaming_and_source() -> None:
    assert 'static let uncheckedGlyph = "☐"' in SWIFT
    assert 'static let checkedGlyph = "☑"' in SWIFT
    assert 'static let uncheckedLabel = "Unchecked"' in SWIFT
    assert 'static let checkedLabel = "Checked"' in SWIFT
    assert "static func split(_ text: String, completed: Bool)" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "static func stripQuoteMarker" in SWIFT
    assert "static func parseTaskLine" in SWIFT
    assert "return nil" in SWIFT
    assert "Not a control" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "Toggle" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function splitQuoteAndTasks" in DESKTOP
    assert "export function quoteTaskAnimates" in DESKTOP
    assert "return false" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_quotes_and_tasks_are_styled_and_static() -> None:
    quote = _slice(MARKDOWN, "struct MarkdownQuoteBlock", "struct MarkdownTaskList")
    tasks = _slice(MARKDOWN, "struct MarkdownTaskList", "struct MarkdownTableBlock")
    assert "MarkdownSetext.protectLazy(source, completed: completed)" in MARKDOWN
    assert "MarkdownQuoteTask.split(" in MARKDOWN
    assert "Rectangle()" in quote
    assert ".frame(width: 2)" in quote
    assert ".padding(.leading, 10)" in quote
    assert ".foregroundStyle(.secondary)" in quote
    assert "MarkdownQuoteTask.animation(reduceMotion: reduceMotion)" in quote
    assert "withAnimation" not in quote
    assert "Toggle" not in quote
    assert "MarkdownQuoteTask.glyph(checked: item.checked)" in tasks
    assert "MarkdownQuoteTask.glyphLabel(checked: item.checked)" in tasks
    assert "item.checked" in tasks
    assert ".foregroundStyle(.secondary)" in tasks
    assert "MarkdownQuoteTask.animation(reduceMotion: reduceMotion)" in tasks
    assert "withAnimation" not in tasks
    assert "Toggle" not in tasks
    assert 'type="checkbox"' not in tasks
    assert "byCharWrapping" in MARKDOWN
    assert ".lineLimit(nil)" in MARKDOWN
    assert "ScrollView(.horizontal" in MARKDOWN
    assert 'className="md-quote"' in BODY
    assert "md-task-item is-checked" in BODY
    assert "taskGlyph(item.checked)" in BODY
    assert "padding-left: 10px;" in CSS
    assert "border-left: 2px solid var(--border);" in CSS
    assert "color: var(--text-muted);" in CSS
    assert "list-style: none;" in CSS
    assert "pointer-events: none;" in CSS
    assert "prefers-reduced-motion: reduce" in CSS
    assert "copyText(reply.content)" in APP
    assert "tableClipboardText(table.source)" in BODY


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.32 " in ROADMAP
    assert "## 132. v1.32" in SPEC
    assert "blockquotes and task lists in completed assistant replies" in SPEC
    assert "test_ios_markdown_quote_task.py" in CI
    assert "markdownQuoteTask.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_split_keeps_streaming_and_source()
    test_ios_quotes_and_tasks_are_styled_and_static()
    test_docs_and_openapi()
    print("ios markdown quote task ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
