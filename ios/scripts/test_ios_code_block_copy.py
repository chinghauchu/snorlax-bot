#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.66 iOS fenced-code Copy.

Top-right Copy on a fence copies the code only (no fences, no language
tag), shows Copied for 1.5s, then reverts. Hidden while that message is
still streaming. No animation (Reduce Motion included). No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "CodeBlockCopy.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_TS = (ROOT / "desktop" / "src" / "codeBlockCopy.ts").read_text(encoding="utf-8")
DESKTOP_MD = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.66 fenced code block Copy (top-right Copy copies the code only; "
    "Copied for 1.5s then reverts; hidden while streaming; no animation; "
    "no new HTTP)"
)


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_clipboard_is_body_only_and_reverts_after_1_5s() -> None:
    assert SWIFT.count("return source") >= 1 or "source" in SWIFT
    assert "static func clipboardText(_ source: String) -> String" in SWIFT
    assert "source" in _slice(SWIFT, "func clipboardText", "static func animation")
    assert "```" not in _slice(SWIFT, "func clipboardText", "static func animation")
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert 'static let copyLabel = "Copy"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copyAria = "Copy code"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert "copied ? copiedLabel : copyLabel" in SWIFT
    assert "completed" in SWIFT
    assert "return nil" in SWIFT
    assert "CODE_BLOCK_COPY_MS = 1500" in DESKTOP_TS
    assert 'return source' in DESKTOP_TS
    assert "return false" in DESKTOP_TS


def test_fence_button_hidden_while_streaming_no_animation() -> None:
    bar = _slice(MARKDOWN, "struct FenceBar", "struct FenceSource")
    assert "CodeBlockCopy.showsCopy(completed: completed)" in bar
    assert "CodeBlockCopy.clipboardText(source)" in bar
    assert "CodeBlockCopy.label(copied: copied)" in bar
    assert "CodeBlockCopy.accessibilityLabel(copied: copied)" in bar
    assert "CodeBlockCopy.animation(reduceMotion: reduceMotion)" in bar
    assert "Spacer(minLength: 0)" in bar
    assert "UIPasteboard.general.string = message.content" not in bar
    assert "language" not in _slice(bar, "UIPasteboard.general.string", "copied = true")
    assert "showCodeBlockCopy(completed)" in DESKTOP_MD
    assert "codeBlockClipboardText(source)" in DESKTOP_MD
    assert "aria-label={codeBlockCopyAriaLabel(copied)}" in DESKTOP_MD
    assert 'type="button"' in DESKTOP_MD
    copy_css = DESKTOP_CSS[
        DESKTOP_CSS.find("\n.md-copy {") : DESKTOP_CSS.find(
            "}", DESKTOP_CSS.find("\n.md-copy {")
        )
        + 1
    ]
    assert "margin-left: auto" in copy_css
    assert "transition: none" in copy_css
    assert "animation: none" in copy_css
    assert "prefers-reduced-motion: reduce" in DESKTOP_CSS
    # Message-level Copy still shows Copied beside the control for 1.2s.
    assert 'Button("Copy")' in CHAT
    assert "1_200_000_000" in CHAT
    assert "1_500_000_000" not in CHAT
    assert 'Text("Copied")' in CHAT


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_code_block_copy.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN
    assert "computerPane.ts" not in DESKTOP_TS
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP_TS


def main() -> int:
    tests = [
        test_clipboard_is_body_only_and_reverts_after_1_5s,
        test_fence_button_hidden_while_streaming_no_animation,
        test_openapi_roadmap_ci_no_computer_pane,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}", file=sys.stderr)
    if failed:
        print(f"{failed} failed", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
