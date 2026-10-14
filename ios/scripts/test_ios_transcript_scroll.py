#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.03 transcript keyboard scroll.

Hardware Page Up / Page Down scroll the loaded transcript about one
viewport. Command-up / control-up (and Home) jump to the oldest
loaded messages. Command-down / control-down (and End) jump to the
latest and re-arm stick-to-bottom the same way Jump to latest does.
The composer, find bar, shortcuts sheet, and lightbox keep the keys.
Nothing is sent. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "TranscriptScroll.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "transcriptScroll.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.03 transcript keyboard scroll (PageUp/PageDown scrolls the loaded "
    "transcript about one viewport; Cmd/Ctrl-Home jumps to the oldest loaded "
    "messages; Cmd/Ctrl-End jumps to the latest and re-arms stick-to-bottom "
    "the same way Jump to latest does; keys are not stolen from the composer, "
    "find bar, rename field, quick switcher, shortcuts overlay, lightbox, or "
    "a focused widget, approve, or connect card; IME stays; Up-arrow recall, "
    "Esc=Stop, Esc=Jump, Alt+Up/Down, Cmd/Ctrl-L, Cmd/Ctrl-Shift-C, and "
    "in-chat find stay; Reduce Motion adds no animation beyond native scroll; "
    "the shortcuts list includes Page Up / Page Down and Cmd/Ctrl Home / End; "
    "iOS hardware Page Up / Page Down and command-up / command-down match and "
    "are listed in Gestures & shortcuts; no new HTTP)"
)


def action(key, command=False, control=False, option=False, shift=False):
    if option or shift or (command and control):
        return None
    chord = command or control
    if key == "pageUp":
        return None if chord else "pageUp"
    if key == "pageDown":
        return None if chord else "pageDown"
    if key == "up":
        return "top" if chord else None
    if key == "down":
        return "bottom" if chord else None
    if key == "home":
        return "top"
    if key == "end":
        return "bottom"
    return None


def offset(box, name):
    max_offset = max(0, box["content"] - box["viewport"])
    delta = max(0, box["viewport"])
    if name == "pageUp":
        raw = box["offset"] - delta
    elif name == "pageDown":
        raw = box["offset"] + delta
    elif name == "top":
        raw = 0
    else:
        raw = max_offset
    return min(max_offset, max(0, raw))


def test_keys_and_viewport() -> None:
    assert action("pageUp") == "pageUp"
    assert action("pageDown") == "pageDown"
    assert action("up", command=True) == "top"
    assert action("down", command=True) == "bottom"
    assert action("up", control=True) == "top"
    assert action("down", control=True) == "bottom"
    assert action("home") == "top"
    assert action("end") == "bottom"
    assert action("home", command=True) == "top"
    assert action("end", control=True) == "bottom"
    assert action("up") is None
    assert action("down") is None
    assert action("pageUp", shift=True) is None
    assert action("pageDown", option=True) is None
    assert action("pageDown", command=True) is None
    assert action("down", command=True, control=True) is None
    assert action("up", command=True, option=True) is None
    box = {"offset": 400, "content": 2000, "viewport": 500}
    assert offset(box, "pageDown") == 900
    assert offset(box, "pageUp") == 0
    assert offset(box, "top") == 0
    assert offset(box, "bottom") == 1500
    assert offset({"offset": 1400, "content": 2000, "viewport": 500}, "pageDown") == 1500
    assert 'static let pageKeysLabel = "Page Up / Page Down"' in SWIFT
    assert 'static let pageAction = "Scroll the transcript"' in SWIFT
    assert 'static let edgeKeysLabel = "⌘↑ / ⌘↓"' in SWIFT
    assert 'static let edgeAction = "Oldest or latest messages"' in SWIFT
    assert "func action" in SWIFT
    assert "func offset" in SWIFT
    assert "func prefersJumpToLatest" in SWIFT
    assert "func reconcile" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "Page Up / Page Down" in DESKTOP
    assert "Cmd/Ctrl Home / End" in DESKTOP
    assert "prefersJumpToLatest" in DESKTOP
    assert "transcriptScrollAnimates" in DESKTOP


def test_chat_scrolls_without_sending() -> None:
    start = CHAT.index("func applyTranscriptScroll")
    end = CHAT.index("private func chatNavKey", start)
    handler = CHAT[start:end]
    assert "TranscriptScroll.prefersJumpToLatest" in handler
    assert "StickToBottom.onJumpToLatest" in handler
    assert "TranscriptScroll.offset" in handler
    assert "scrollTo(point:" in handler
    assert "model.send(" not in handler
    assert "func transcriptScrollKey" in CHAT
    assert "TranscriptScroll.action" in CHAT
    assert "composerFocused" in CHAT
    assert "findFieldFocused" in CHAT
    assert "textInputIsFirstResponder" in CHAT
    assert "scrollPosition($transcriptPosition)" in CHAT
    assert "keyboardJumpToken" in CHAT
    assert "scrollTo(edge: .bottom)" in CHAT
    assert "shouldFocusComposerAfterAbort" in CHAT
    assert "const onTranscriptScrollKey" in APP
    assert "onJumpLatest()" in APP
    assert "nextTranscriptScrollTop" in APP
    assert 'addEventListener("keydown", onTranscriptScrollKey, true)' in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "TranscriptScroll.pageKeysLabel" in SHEET
    assert "TranscriptScroll.edgeKeysLabel" in SHEET
    assert "TranscriptScroll.pageAction" in SHEET
    assert "TranscriptScroll.edgeAction" in SHEET
    assert "Gestures & shortcuts" in SHEET
    assert ".onKeyPress" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.03 " in ROADMAP
    assert "## 103. v1.03" in SPEC
    assert "python3 ios/scripts/test_ios_transcript_scroll.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_keys_and_viewport,
        test_chat_scrolls_without_sending,
        test_openapi_roadmap,
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
