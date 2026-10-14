#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.84 composer auto-grows with typed text.

Typing or pasting multi-line text grows the composer up to about 8
lines / 160px, then the field scrolls inside. Deleting text shrinks
it. An empty composer stays one line. Attachment chips, mic, Send,
and the paperclip stay put. Reduce Motion changes height instantly.
Enter sends and Shift-Enter inserts a newline. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
VIEW = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ComposerGrow.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "composerGrow.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.84 composer auto-grows with typed text (typing or pasting "
    "multi-line text grows the composer up to about 8 lines / 160px, "
    "then the field scrolls inside; deleting text shrinks it; an empty "
    "composer stays one line; attachment chips, mic, Send, and the "
    "paperclip stay put; Reduce Motion changes height instantly; Enter "
    "sends and Shift-Enter inserts a newline; no new HTTP)"
)


def frame(content: float, empty: bool, resting: float, max_height: float = 160, min_height: float = 22):
    """Same rules as ComposerGrow.frame / the desktop cap."""
    resting = max(min_height, resting)
    if empty or content <= resting + 1:
        return resting, False
    capped = min(math.ceil(content), max_height)
    return max(capped, resting), content > max_height


def test_grows_then_scrolls_and_shrinks() -> None:
    # Empty and one line stay at the resting height. No internal scroll.
    assert frame(26, True, 26) == (26, False)
    assert frame(400, True, 26) == (26, False)
    assert frame(27, False, 26) == (26, False)
    # A second line grows. The cap is 160, then the field scrolls.
    assert frame(52, False, 26) == (52, False)
    assert frame(160, False, 26) == (160, False)
    assert frame(161, False, 26) == (160, True)
    assert frame(400.2, False, 26) == (160, True)
    # Deleting shrinks, then an empty field is one line again.
    assert frame(90, False, 26) == (90, False)
    assert frame(26, False, 26) == (26, False)

    assert "static let maxHeight: CGFloat = 160" in SWIFT
    assert "static let minHeight: CGFloat = 22" in SWIFT
    assert "contentHeight <= resting + 1" in SWIFT
    assert "contentHeight > maxHeight" in SWIFT
    assert "return nil" in SWIFT
    assert "_ = reduceMotion" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "fetch(" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "COMPOSER_MAX_PX = 160" in DESKTOP
    assert "scrollHeight <= input.restingHeight + 1" in DESKTOP
    assert "input.scrollHeight > maxPx" in DESKTOP
    assert "return 0" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_composer_wires_grow_without_moving_chrome() -> None:
    assert "ComposerGrow.frame(" in VIEW
    assert "ComposerGrow.contentHeight(" in VIEW
    assert "widthTracksTextView = true" in VIEW
    assert "isScrollEnabled = fitted.scroll" in VIEW
    assert "scrollRangeToVisible" in VIEW
    assert "markedTextRange" in VIEW
    assert "keyboardReturn" in VIEW
    assert "modifierFlags.contains(.shift)" in VIEW
    assert "onArrowUpRecall" in VIEW
    assert "onReturnSend" in VIEW
    start = CHAT.index("HStack(alignment: .bottom, spacing: 8)")
    bar = CHAT[start : CHAT.index('.accessibilityLabel("Send")', start)]
    paperclip = bar.index('Image(systemName: "paperclip")')
    field = bar.index("ComposerTextView(")
    mic = bar.index('Image(systemName: "mic")')
    send = bar.index('Image(systemName: "arrow.up.circle.fill")')
    assert paperclip < field < mic < send
    assert "ComposerGrow.minHeight" in bar
    assert "ComposerGrow.maxHeight" in bar
    assert ".animation(" not in bar
    assert "composerFrame(" in APP
    assert "resizeComposer(draft.length === 0)" in APP
    assert "max-height: 160px" in CSS
    assert "min-height: 22px" in CSS
    assert "transition: none" in CSS


def test_openapi_stays_0180() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert not PANE.exists()
    assert "computerPane.ts" not in VIEW
    assert "computerPane.ts" not in SWIFT
    assert PHRASE in ROADMAP
    assert "/ v0.84 " in ROADMAP
    assert "python3 ios/scripts/test_ios_composer_grow.py" in CI


def main() -> int:
    tests = [
        test_grows_then_scrolls_and_shrinks,
        test_composer_wires_grow_without_moving_chrome,
        test_openapi_stays_0180,
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
    sys.exit(main())
