#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.29 soft-wrap toggle on assistant code blocks.

The v0.11 language label already sits in the fence header. This cut
adds Wrap beside Copy. Default is no wrap with horizontal scroll.
Wrap soft-wraps that block only. The choice is session memory, not
UserDefaults. A rendered mermaid diagram keeps horizontal scroll.
Hidden while streaming. No animation. No new shortcut. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CodeBlockWrap.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "codeBlockWrap.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.29 soft-wrap toggle on assistant code blocks"


def test_wrap_is_per_block_and_not_persisted() -> None:
    assert 'static let wrapLabel = "Wrap"' in SWIFT
    assert 'static let unwrapLabel = "Unwrap"' in SWIFT
    assert 'static let wrapAria = "Wrap lines"' in SWIFT
    assert 'static let unwrapAria = "Unwrap lines"' in SWIFT
    assert "static func showsWrap(completed: Bool) -> Bool" in SWIFT
    assert "static func toggle(id: String, wrapped: Bool) -> Bool" in SWIFT
    assert "static func persistsAcrossRelaunch() -> Bool { false }" in SWIFT
    assert "return nil" in SWIFT
    assert "not written to disk" in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "Not written to disk" in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "export function codeBlockWrapPersists" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_fence_toggles_wrap_beside_copy() -> None:
    bar = MARKDOWN.split("struct FenceBar", 1)[1].split("struct FenceSource", 1)[0]
    assert "CodeBlockWrap.showsWrap(completed: completed)" in bar
    assert "CodeBlockWrap.label(wrapped: wrapped)" in bar
    assert "CodeBlockWrap.accessibilityLabel(wrapped: wrapped)" in bar
    assert "CodeBlockCopy.clipboardText(source)" in bar
    assert "Spacer(minLength: 0)" in bar
    assert 'Text(language)' in bar
    assert "showsWrap: true" in MARKDOWN
    assert "showsWrap: failed" in MARKDOWN
    assert "FenceSource(source: source, wrapped: wrapped)" in MARKDOWN
    assert "ScrollView(.horizontal" in MARKDOWN
    assert "func expandsHorizontally(wrapped: Bool) -> Bool" in SWIFT
    assert "CodeBlockWrap.expandsHorizontally(wrapped: wrapped)" in MARKDOWN
    assert "wrapScope:" in CHAT
    assert "CodeBlockWrap.blockId" in MARKDOWN
    assert "wrapScope={bubbleRowId}" in APP
    assert "codeBlockWrapClass(wrapOn)" in BODY
    assert "toggleCodeBlockWrap(wrapId, wrapped)" in BODY
    assert "aria-pressed={wrapped}" in BODY
    assert "white-space: pre;" in CSS
    assert "white-space: pre-wrap;" in CSS
    assert ".md-fence-wrap" in CSS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.29 " in ROADMAP
    assert "## 129. v1.29" in SPEC
    assert "test_ios_code_block_wrap.py" in CI
    assert "codeBlockWrap.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_wrap_is_per_block_and_not_persisted()
    test_ios_fence_toggles_wrap_beside_copy()
    test_docs_and_openapi()
    print("ios code block wrap ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
