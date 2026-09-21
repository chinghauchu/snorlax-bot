#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.58 iOS Reduce Motion static waiting ···.

When the OS Reduce Motion / accessibility setting is on, paint static
muted ··· (no pulse). When off, keep the existing pulse. Streaming caret
already static under Reduce Motion (v0.52) — no change there.
Appear/dismiss rules for ··· unchanged (Send → first token / Stop /
error / empty). No new HTTP. OpenAPI stays 0.18.0. Keep v0.47–v0.57
intact. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
MUTED = (IOS / "SendMuted.swift").read_text(encoding="utf-8")
COMPACT = (IOS / "CompactToolTraces.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_WAIT = (ROOT / "desktop" / "src" / "waiting.ts").read_text(
    encoding="utf-8"
)
DESKTOP_CARET = (ROOT / "desktop" / "src" / "streamingCaret.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(
    encoding="utf-8"
)


def _fn(src: str, name: str) -> str:
    markers = (
        f"func {name}",
        f"static func {name}",
        f"async function {name}",
        f"function {name}",
        f"export function {name}",
    )
    start = -1
    used = ""
    for marker in markers:
        idx = src.find(marker)
        if idx >= 0:
            start = idx
            used = marker
            break
    if start < 0:
        raise AssertionError(f"missing {name}")
    nxt = src.find("\n    func ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    static func ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    async function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    export function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def _block(css: str, selector: str) -> str:
    needle = f"\n{selector} {{"
    idx = css.find(needle)
    if idx < 0:
        raise AssertionError(f"missing {selector}")
    start = css.find("{", idx)
    end = css.find("}", start)
    return css[start : end + 1]


def _reduced_motion_blocks(css: str) -> list[str]:
    needle = "@media (prefers-reduced-motion: reduce)"
    out: list[str] = []
    from_idx = 0
    while True:
        idx = css.find(needle, from_idx)
        if idx < 0:
            break
        start = css.find("{", idx)
        depth = 0
        end = start
        for i in range(start, len(css)):
            if css[i] == "{":
                depth += 1
            elif css[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        out.append(css[idx : end + 1])
        from_idx = end + 1
    return out


def test_reduce_motion_on_static_dots() -> None:
    pulse = _fn(WAITING, "shouldPulse")
    assert "!reduceMotion" in pulse
    desktop = _fn(DESKTOP_WAIT, "waitingDotsShouldPulse")
    assert "return !reduceMotion" in desktop
    assert "WaitingChrome.shouldPulse(reduceMotion: reduceMotion)" in WAITING
    assert "accessibilityReduceMotion" in WAITING
    assert 'Text(WaitingChrome.label)' in WAITING
    assert "static muted" in WAITING
    reduce_blocks = _reduced_motion_blocks(DESKTOP_CSS)
    waiting_reduce = next(
        (b for b in reduce_blocks if ".waiting-dots span" in b), ""
    )
    assert waiting_reduce, "missing desktop Reduce Motion rule for waiting ···"
    waiting_rule = waiting_reduce[waiting_reduce.find(".waiting-dots span") :]
    assert "animation: none" in waiting_rule
    assert "animation: waiting-dot" not in waiting_rule


def test_reduce_motion_off_keeps_pulse() -> None:
    assert "TimelineView(.animation" in WAITING
    assert "Self.dotOpacity(t: t, index: index)" in WAITING
    assert "WaitingChrome.shouldPulse(reduceMotion: reduceMotion)" in WAITING
    dots = _block(DESKTOP_CSS, ".waiting-dots span")
    assert "animation: waiting-dot" in dots
    assert "animation: none" not in dots
    assert "@keyframes waiting-dot" in DESKTOP_CSS
    delay2 = _block(DESKTOP_CSS, ".waiting-dots span:nth-child(2)")
    delay3 = _block(DESKTOP_CSS, ".waiting-dots span:nth-child(3)")
    assert "animation-delay: 0.2s" in delay2
    assert "animation-delay: 0.4s" in delay3
    assert 'className="waiting-dots"' in DESKTOP_APP
    assert "WAITING_DOT" in DESKTOP_APP


def test_caret_reduce_motion_unchanged() -> None:
    assert "accessibilityReduceMotion" in CARET
    assert "Reduce Motion skips" in CARET or "reduceMotion" in CARET
    assert "if reduceMotion" in CARET
    assert "TimelineView(.animation" in CARET
    caret = _block(DESKTOP_CSS, ".streaming-caret")
    assert "height: 12px" in caret
    assert "var(--text-muted)" in caret
    assert "animation: streaming-caret-blink" in caret
    reduce_blocks = _reduced_motion_blocks(DESKTOP_CSS)
    caret_reduce = next(
        (b for b in reduce_blocks if ".streaming-caret" in b), ""
    )
    assert caret_reduce, "missing desktop Reduce Motion rule for caret"
    assert "animation: none" in caret_reduce[caret_reduce.find(".streaming-caret") :]
    assert "waitingDotsShouldPulse" not in DESKTOP_CARET
    assert "WaitingChrome.shouldPulse" not in CARET


def test_appear_dismiss_unchanged() -> None:
    show = _fn(WAITING, "shouldShow")
    assert "busy && !hasFirstToken && !hasLiveTool && !hasError" in show
    assert "WaitingChrome.shouldShow(" in CHAT
    assert "showWaitingLine({" in DESKTOP_APP
    assert "hasFirstToken: hasFirstToken" in CHAT
    assert "hasError: model.errorMessage != nil || model.composerError != nil" in CHAT
    assert "hasError: Boolean(composerError)" in DESKTOP_APP
    assert "StopGenerating.shouldOffer(busy: model.isSending)" in CHAT
    assert "shouldOfferStop(busy)" in DESKTOP_APP


def test_openapi_stays_0180_and_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static func insert(" in OPT
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func whileGenerating(busy: Bool)" in MUTED
    assert "N tools" in COMPACT or "toolsLabel" in COMPACT
    assert "static func shouldRenderMarkdown" in PLAIN
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.58" in OPENAPI
    assert "v0.58" in RUNTIME_OPENAPI
    assert "v0.58" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "computerPane.ts" not in WAITING
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in DESKTOP_WAIT
    assert not DESKTOP_PANE.exists()
    assert "/v1/chats/" not in WAITING
    assert "/v1/chats/" not in DESKTOP_WAIT
    assert "/v1/cancel" not in WAITING
    assert "from \"./midStreamPlaintext\"" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP


def main() -> int:
    tests = [
        test_reduce_motion_on_static_dots,
        test_reduce_motion_off_keeps_pulse,
        test_caret_reduce_motion_unchanged,
        test_appear_dismiss_unchanged,
        test_openapi_stays_0180_and_intact_stack,
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
