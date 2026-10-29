#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.23 copy a math block.

A completed assistant display-math block offers a muted Copy.
Tap or click copies the TeX without the $$ delimiters, then the
label reads Copied for 1.5s. Inline math has no Copy. A streaming
block, and a block whose closing $$ has not arrived, hide it. A
formula that fails to render still copies its TeX. The control
does not take composer focus. No new animation. No new shortcut.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MathBlockCopy.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "mathBlockCopy.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.23 copy a math block"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_tex() -> None:
    assert 'static let copyLabel = "Copy"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copyAria = "Copy math"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert "static func showsCopy(completed: Bool, closed: Bool) -> Bool" in SWIFT
    assert "static func clipboardText(_ tex: String) -> String" in SWIFT
    assert "return nil" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'MATH_BLOCK_COPY_LABEL = "Copy"' in DESKTOP
    assert 'MATH_BLOCK_COPY_ARIA = "Copy math"' in DESKTOP
    assert "export function mathBlockClipboardText" in DESKTOP
    assert "export function showMathBlockCopy" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_block_copies_tex_and_inline_does_not() -> None:
    math = _slice(MARKDOWN, "struct MathBlock", "struct MathInline")
    assert "MathBlockCopy.showsCopy(completed: completed, closed: closed)" in math
    assert "MathBlockCopy.clipboardText(source)" in math
    assert "MathBlockCopy.label(copied: copied)" in math
    assert "MathBlockCopy.accessibilityLabel(copied: copied)" in math
    assert "MathBlockCopy.feedbackNanoseconds" in math
    assert "focusable(false)" in math
    assert "UIPasteboard.general.string" in math
    assert "CodeBlockCopy" not in math
    assert "CodeBlockSave" not in math
    inline = _slice(MARKDOWN, "struct MathInline", "struct MathFallback")
    assert "MathBlockCopy" not in inline
    streaming = _slice(MARKDOWN, "case .blockMath", "if showFootnotes")
    assert "completed && closed" in streaming
    assert "MathFallback" in streaming
    assert "showMathBlockCopy({" in BODY
    assert "mathBlockClipboardText(tex)" in BODY
    assert 'className="md-math-bar"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert "Copy math" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 223. v2.23" in SPEC
    assert "test_ios_math_block_copy.py" in CI
    assert "mathBlockCopy.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_tex()
    test_block_copies_tex_and_inline_does_not()
    test_docs_and_openapi()
    print("ios math block copy ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
