#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.51 CommonMark loose and tight lists in completed assistant replies.

A tight list keeps compact item spacing. A loose list — a blank line
between any items, or between an item's blocks — uses paragraph spacing.
Bullet, ordered, and task lists follow the rule. Nested lists keep their
own looseness. Streaming stays plain text. Copy keeps markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownLooseList.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
TASKS = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownLooseList.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
BUBBLES = (ROOT / "desktop" / "src" / "assistantBubbles.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.51 CommonMark loose and tight lists in completed assistant replies"


def test_classifier_keeps_streaming_and_source() -> None:
    assert "static func isLoose(_ text: String, completed: Bool)" in SWIFT
    assert "if !completed || text.isEmpty { return false }" in SWIFT
    assert "static func itemSpacing(loose: Bool)" in SWIFT
    assert "static let tightSpacing: CGFloat = 4" in SWIFT
    assert "static let looseSpacing: CGFloat = 8" in SWIFT
    assert "itemDirectlyLoose" in SWIFT
    assert "MarkdownList.listEnd" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function listIsLoose" in DESKTOP
    assert "export function listItemSpacing" in DESKTOP
    assert "TIGHT_LIST_ITEM_SPACING_PX = 4" in DESKTOP
    assert "LOOSE_LIST_ITEM_SPACING_PX = 8" in DESKTOP
    assert "markdownListEnd" in DESKTOP
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_and_desktop_share_the_rule() -> None:
    assert "MarkdownLooseList.isLoose" in LISTS
    assert "static func listEnd" in LISTS
    assert "var loose: Bool" in LISTS
    assert "MarkdownLooseList.isLoose" in TASKS
    assert "loose: Bool" in TASKS
    assert "MarkdownLooseList.itemSpacing(loose: group.loose)" in MARKDOWN
    assert "MarkdownLooseList.itemSpacing(loose: loose)" in MARKDOWN
    assert "MarkdownLooseList.animation(reduceMotion: reduceMotion)" in MARKDOWN
    assert "MarkdownList.listEnd" in MARKDOWN
    assert 'className="md-task-list"' in BODY
    assert 'data-loose={block.loose ? "true" : "false"}' in BODY
    assert '.assistant-md li > p:last-child' in CSS
    assert "margin-bottom: 8px;" in CSS
    assert '[data-loose="true"]' in CSS
    assert "markdownListEnd" in BUBBLES
    assert "copyText(reply.content)" in APP
    assert "listIsLoose(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.51 " in ROADMAP
    assert "## 151. v1.51" in SPEC
    assert "loose and tight lists in completed assistant replies" in SPEC
    assert "test_ios_markdown_loose_list.py" in CI
    assert "markdownLooseList.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_classifier_keeps_streaming_and_source()
    test_ios_and_desktop_share_the_rule()
    test_docs_and_openapi()
    print("ios markdown loose list ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
