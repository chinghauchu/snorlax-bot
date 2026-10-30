#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.27 copy inline math.

A completed assistant inline formula offers a muted 12px/12pt Copy.
Desktop shows it on hover or keyboard focus, out of flow. iOS shows
it beside the formula. Tap or click copies the TeX without the \\( \\)
delimiters, then the label reads Copied for 1.5s. A streaming formula,
and one whose closing delimiter has not arrived, hide it. A formula
that fails to render still copies its TeX. Display-math Copy is
unchanged. The control does not take composer focus. No new animation.
No new shortcut. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "InlineMathCopy.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "mathInlineCopy.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.27 copy inline math"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_tex() -> None:
    assert 'static let copyLabel = "Copy"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copyAria = "Copy inline math"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert "static func showsCopy(completed: Bool, closed: Bool) -> Bool" in SWIFT
    assert "static func clipboardText(_ tex: String) -> String" in SWIFT
    assert "return nil" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'MATH_INLINE_COPY_LABEL = "Copy"' in DESKTOP
    assert 'MATH_INLINE_COPY_ARIA = "Copy inline math"' in DESKTOP
    assert "export function mathInlineClipboardText" in DESKTOP
    assert "export function showMathInlineCopy" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "$$" not in DESKTOP


def test_inline_copies_tex_and_display_stays_separate() -> None:
    button = _slice(MARKDOWN, "struct InlineMathCopyButton", "struct MathInline")
    assert "InlineMathCopy.showsCopy(completed: completed, closed: closed)" in button
    assert "InlineMathCopy.clipboardText(tex)" in button
    assert "InlineMathCopy.label(copied: copied)" in button
    assert "InlineMathCopy.accessibilityLabel(copied: copied)" in button
    assert "InlineMathCopy.feedbackNanoseconds" in button
    assert "transcriptFont(12)" in button
    assert "focusable(false)" in button
    assert "UIPasteboard.general.string" in button
    assert "MathBlockCopy" not in button
    assert "raw" not in button
    inline = _slice(MARKDOWN, "struct MathInline", "struct MathFallback")
    assert "InlineMathCopyButton(tex: source, completed: completed, closed: closed)" in inline
    assert "MathFallback(raw: raw, block: false)" in inline
    assert "MathBlockCopy" not in inline
    assert "UIPasteboard" not in inline
    call = _slice(MARKDOWN, "case .inlineMath", "case .image")
    assert "completed && closed" in call
    assert "MathInline(" in call
    assert "MathFallback" in call
    assert "showMathInlineCopy({" in BODY
    assert "mathInlineClipboardText(tex)" in BODY
    assert 'className="md-math-inline-wrap"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert "Copy inline math" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 227. v2.27" in SPEC
    assert "test_ios_inline_math_copy.py" in CI
    assert "mathInlineCopy.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_tex()
    test_inline_copies_tex_and_display_stays_separate()
    test_docs_and_openapi()
    print("ios inline math copy ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
