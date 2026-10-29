#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.19 collapse long code blocks.

A completed assistant code fence or indented code block longer than
14 lines shows the first 14 lines and a muted Show more. Tap expands
that block and the control becomes Show less. Each block collapses
on its own. Streaming stays open. A rendered mermaid diagram stays a
diagram. Copy still copies the full source. An active find match in
that block stays fully visible. The control does not take composer
focus. No new animation. No new shortcut. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CodeBlockCollapse.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "codeBlockCollapse.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.19 collapse long code blocks"
LINES = 14


def body(source: str) -> str:
    if source.endswith("\n"):
        return source[:-1]
    return source


def line_count(source: str) -> int:
    text = body(source)
    if text == "":
        return 0
    return len(text.split("\n"))


def overflows(count: int) -> bool:
    return count > LINES


def should_collapse(completed: bool, count: int, expanded: bool, active_find: bool) -> bool:
    return completed and overflows(count) and (not expanded) and (not active_find)


def visible(source: str, collapsed: bool) -> str:
    if not collapsed:
        return source
    text = body(source)
    if text == "":
        return text
    return "\n".join(text.split("\n")[:LINES])


def row_id(wrap_id: str) -> str:
    nul = wrap_id.find("\0")
    return wrap_id if nul < 0 else wrap_id[:nul]


def test_rules() -> None:
    sample = "\n".join(f"line {index}" for index in range(1, 16))
    assert line_count("") == 0
    assert line_count("\n") == 0
    assert line_count("\n\n") == 2
    assert line_count("\n".join(f"line {index}" for index in range(1, 15)) + "\n") == 14
    assert line_count(sample + "\n") == 15
    assert should_collapse(True, 14, False, False) is False
    assert should_collapse(True, 15, False, False) is True
    assert should_collapse(False, 15, False, False) is False
    assert should_collapse(True, 15, True, False) is False
    assert should_collapse(True, 15, False, True) is False
    assert visible(sample + "\n", False).endswith("\n")
    assert visible(sample + "\n", True) == "\n".join(f"line {index}" for index in range(1, 15))
    assert row_id("msg:0\x003") == "msg:0"
    assert row_id("msg#1\x00indent\x002") == "msg#1"
    assert 'static let lines = 14' in SWIFT
    assert 'static let showMore = "Show more"' in SWIFT
    assert 'static let showLess = "Show less"' in SWIFT
    assert 'static let showMoreAria = "Show more code"' in SWIFT
    assert 'static let showLessAria = "Show less code"' in SWIFT
    assert "static func shouldCollapse(" in SWIFT
    assert "static func findKeepsOpen(" in SWIFT
    assert "ChatFind.indexHits" in SWIFT
    assert "return false" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "CODE_BLOCK_COLLAPSE_LINES = 14" in DESKTOP
    assert 'CODE_BLOCK_SHOW_MORE = "Show more"' in DESKTOP
    assert 'CODE_BLOCK_SHOW_MORE_ARIA = "Show more code"' in DESKTOP
    assert "export function shouldCollapseCodeBlock" in DESKTOP
    assert "export function codeBlockFindKeepsOpen" in DESKTOP
    assert "export function codeBlockFindRowId" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "new Map" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP


def test_clients_collapse_finished_blocks() -> None:
    fence = MARKDOWN.split("struct CodeFence", 1)[1].split("struct FenceMoreButton", 1)[0]
    assert "CodeBlockCollapse.lineCount(source)" in fence
    assert "CodeBlockCollapse.findKeepsOpen(" in fence
    assert "CodeBlockCollapse.shouldCollapse(" in fence
    assert "CodeBlockCollapse.visibleText(source, collapsed: collapsed)" in fence
    assert "source: source" in fence
    assert (
        "FenceSource(source: source, wrapped: wrapped, language: language, completed: completed)"
        in fence
    )
    assert "expanded = false" in fence
    more = MARKDOWN.split("struct FenceMoreButton", 1)[1].split("struct FenceBar", 1)[0]
    assert "CodeBlockCollapse.label(expanded: expanded)" in more
    assert "CodeBlockCollapse.accessibilityLabel(expanded: expanded)" in more
    assert "focusable(false)" in more
    assert ".focus(" not in more
    mermaid = MARKDOWN.split("struct MermaidFence", 1)[1].split("struct CodeFence", 1)[0]
    assert "if failed {" in mermaid
    assert "FenceMoreButton(" in mermaid
    assert "FenceSource(source: source, wrapped: wrapped)" in mermaid
    assert "CodeBlockCollapse.visibleText" in mermaid
    failed = mermaid.split("if failed {", 1)[1].split("ScrollView(.horizontal", 1)[0]
    assert "FenceMoreButton(" in failed
    assert "FenceSource" not in failed
    after_failed = MARKDOWN.split("if failed {", 1)[1]
    picture = after_failed.split("ScrollView(.horizontal", 1)[1].split(
        ".padding(.horizontal, 10)", 1
    )[0]
    assert "FenceMoreButton" not in picture
    assert "CodeBlockCollapse" not in picture
    assert "codeBlockVisibleText(source, collapsed)" in BODY
    assert 'className="md-fence-more"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert "codeBlockClipboardText(source)" in BODY
    assert 'rowId={activeFindHit?.rowId ?? ""}' in APP
    assert "useFindRowId()" in BODY
    assert "Show more code" not in SHORTCUTS
    assert "/v1/" not in MARKDOWN[MARKDOWN.index("struct FenceMoreButton"):MARKDOWN.index("struct FenceBar")]


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 219. v2.19" in SPEC
    assert "test_ios_code_block_collapse.py" in CI
    assert "codeBlockCollapse.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rules()
    test_clients_collapse_finished_blocks()
    test_docs_and_openapi()
    print("ios code block collapse ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
