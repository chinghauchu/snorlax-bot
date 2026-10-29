#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.22 show line numbers on a code block.

The v1.29 Wrap control is already beside Copy. This cut adds Lines
beside Wrap. Default is no gutter. Lines shows a muted number on
each line of that block. The choice is session memory, not
UserDefaults. Copy and Save keep the fence body. A rendered mermaid
diagram has no Lines control. Hidden while streaming. A math block
has none. No animation. No new shortcut. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CodeBlockLines.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "codeBlockLines.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.22 show line numbers on a code block"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_lines_are_per_block_and_not_persisted() -> None:
    assert 'static let linesLabel = "Lines"' in SWIFT
    assert 'static let hideLabel = "No lines"' in SWIFT
    assert 'static let linesAria = "Show line numbers"' in SWIFT
    assert 'static let hideAria = "Hide line numbers"' in SWIFT
    assert "static func showsLines(completed: Bool) -> Bool" in SWIFT
    assert "static func toggle(id: String, numbered: Bool) -> Bool" in SWIFT
    assert "static func persistsAcrossRelaunch() -> Bool { false }" in SWIFT
    assert "static func includedInClipboard() -> Bool { false }" in SWIFT
    assert "static func gutterLabel(index: Int) -> String" in SWIFT
    assert "return nil" in SWIFT
    assert "not written to disk" in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "Not written to disk" in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "export function codeBlockLinesPersists" in DESKTOP
    assert "export function codeBlockLinesInClipboard" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_fence_toggles_lines_beside_wrap() -> None:
    bar = _slice(MARKDOWN, "struct FenceBar", "struct FenceSource")
    assert "CodeBlockLines.showsLines(completed: completed)" in bar
    assert "CodeBlockLines.label(numbered: numbered)" in bar
    assert "CodeBlockLines.accessibilityLabel(numbered: numbered)" in bar
    assert "CodeBlockCopy.clipboardText(source)" in bar
    assert "CodeBlockSave.label" in bar
    assert "showsLines: true" in MARKDOWN
    assert "showsLines: failed" in MARKDOWN
    assert "codeBlockNumbered" in MARKDOWN
    assert "CodeBlockLines.gutterLabel(index: index)" in MARKDOWN
    assert "CodeBlockLines.paintedLines" in MARKDOWN
    assert "accessibilityHidden(true)" in MARKDOWN
    assert "CodeHighlight.paint(source, language: language, completed: completed)" in MARKDOWN
    source = _slice(MARKDOWN, "struct FenceSource", "struct MathBlock")
    assert "if numbered && CodeBlockLines.showsLines(completed: completed)" in source
    math = _slice(MARKDOWN, "struct MathBlock", "struct MathFallback")
    assert "CodeBlockLines" not in math
    picture = _slice(MARKDOWN, "ScrollView(.horizontal, showsIndicators: true) {\n                    MermaidWebView(", ".padding(.horizontal, 10)")
    assert "CodeBlockLines" not in picture
    assert "md-fence-lines" in CSS
    assert "position: sticky" in CSS
    assert "user-select: none" in CSS
    assert "Show line numbers" not in SHORTCUTS
    assert "codeBlockLinesClass(linesOn)" in BODY
    assert "toggleCodeBlockLines(wrapId, numbered)" in BODY
    assert 'className="md-fence-lines"' in BODY
    assert "aria-pressed={numbered}" in BODY


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "## 222. v2.22" in SPEC
    assert PHRASE in SPEC
    assert "test_ios_code_block_lines.py" in CI
    assert "codeBlockLines.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_lines_are_per_block_and_not_persisted()
    test_ios_fence_toggles_lines_beside_wrap()
    test_docs_and_openapi()
    print("ios code block lines ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
