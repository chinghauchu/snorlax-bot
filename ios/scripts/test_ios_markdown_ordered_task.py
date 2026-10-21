#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.59 GFM ordered task lists in completed assistant replies.

A completed LEFT kind=message renders `1. [ ]` / `1. [x]` / `9) [X]`
as a list item with a read-only checkbox. Nested task items stay in
the item. A marker without a following space, a `[ ]` that is not at
the start, and `[x]` inside a code span stay literal. Streaming stays
the markdown string. Copy controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownOrderedTask.swift").read_text(encoding="utf-8")
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
TASKS = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownOrderedTask.ts").read_text(encoding="utf-8")
QUOTE = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.59 GFM ordered task lists in completed assistant replies"


def test_ordered_items_parse_a_task_marker() -> None:
    assert "v1.59" in SWIFT
    assert "static func parseItem" in SWIFT
    assert "static func animation" in SWIFT
    assert "return nil" in SWIFT
    assert 'first[index] == "["' in SWIFT
    assert 'mark == " " || mark == "x" || mark == "X"' in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "Toggle" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "export function parseListItemTask" in DESKTOP
    assert "export function remarkOrderedTaskMarkers" in DESKTOP
    assert "export function orderedTaskAnimates" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "static func orderedListEnd" in LIST
    assert "marker.ordered" in LIST
    assert "MarkdownList.orderedListEnd" in TASKS
    assert "v1.59" in TASKS
    assert "orderedListEnd" in QUOTE
    assert "MarkdownOrderedTask.parseItem(item)" in MARKDOWN
    assert "MarkdownQuoteTask.glyph(checked: task.checked)" in MARKDOWN
    assert "MarkdownQuoteTask.glyphLabel(checked: task.checked)" in MARKDOWN
    assert "MarkdownOrderedTask.animation(reduceMotion: reduceMotion)" in MARKDOWN
    assert "if !completed { return [.markdown(src)] }" in LIST


def test_copy_stays_source() -> None:
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.59 " in ROADMAP
    assert "## 159. v1.59" in SPEC
    assert "GFM ordered task lists in completed assistant replies" in SPEC
    assert "test_ios_markdown_ordered_task.py" in CI
    assert "markdownOrderedTask.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_ordered_items_parse_a_task_marker()
    test_copy_stays_source()
    test_docs_and_openapi()
    print("ios markdown ordered task ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
