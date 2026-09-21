#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.63 iOS Jump chip fade.

Jump to latest chip appear/dismiss uses a 120ms opacity fade. Reduce
Motion on → instant show/hide (no fade). Click / Esc=Jump behavior
unchanged (scroll, re-arm, dismiss, focus composer). No new HTTP.
OpenAPI stays 0.18.0. Keep v0.47–v0.62 intact. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
MUTED = (IOS / "SendMuted.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
COMPACT = (IOS / "CompactToolTraces.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_STICK = (ROOT / "desktop" / "src" / "stickToBottom.ts").read_text(
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
        f"static var {name}",
        f"async function {name}",
        f"function {name}",
        f"export function {name}",
        f"const {name}",
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
        nxt = src.find("\n    static var ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    async function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    export function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    const ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def _block(css: str, selector: str) -> str:
    needle = f"\n{selector} {{"
    idx = css.find(needle)
    if idx < 0:
        raise AssertionError(f"missing {selector}")
    start = css.find("{", idx)
    end = css.find("}", start)
    return css[start : end + 1]


def _jump_chip() -> str:
    start = CHAT.find("Button(StickToBottom.jumpLabel)")
    if start < 0:
        raise AssertionError("missing Jump chip button")
    end = CHAT.find(".accessibilityHidden(!jumpPaint.shown)", start)
    if end < 0:
        end = CHAT.find(".accessibilityLabel(StickToBottom.jumpLabel)", start)
        end = CHAT.find("\n                    }", end)
    else:
        end = CHAT.find("\n                    }", end)
    return CHAT[start:end] if end > start else CHAT[start:]


def _desktop_on_jump() -> str:
    start = DESKTOP_APP.find("const onJumpLatest = useCallback")
    if start < 0:
        raise AssertionError("missing onJumpLatest")
    end = DESKTOP_APP.find("useLayoutEffect", start)
    return DESKTOP_APP[start:end] if end > start else DESKTOP_APP[start:]


def test_fade_120ms_on_appear_and_dismiss() -> None:
    assert "static let jumpFadeMs: Double = 120" in STICK
    assert "JUMP_CHIP_FADE_MS = 120" in DESKTOP_STICK
    fade_ios = _fn(STICK, "jumpChipFadeSeconds(reduceMotion: Bool)")
    assert "reduceMotion ? 0 : jumpFadeSeconds" in fade_ios
    appear = _fn(STICK, "jumpChipAppear(reduceMotion: Bool)")
    assert "mounted: true" in appear
    assert "shown: reduceMotion" in appear
    shown = _fn(STICK, "jumpChipShown()")
    assert "shown: true" in shown
    dismiss = _fn(STICK, "jumpChipDismiss(reduceMotion: Bool)")
    assert "mounted: true, shown: false" in dismiss or "shown: false" in dismiss
    chip = _jump_chip()
    assert ".opacity(jumpPaint.shown ? 1 : 0)" in chip
    assert "StickToBottom.jumpChipAnimation(reduceMotion: reduceMotion)" in chip
    assert "applyJumpChipPaint(shown: shown)" in CHAT
    assert "jumpChipAppear(reduceMotion: reduceMotion)" in CHAT
    assert "jumpChipShown()" in CHAT
    assert "jumpChipDismiss(reduceMotion: reduceMotion)" in CHAT
    assert "jumpChipFadeSeconds(reduceMotion: reduceMotion)" in CHAT
    chip_css = _block(DESKTOP_CSS, ".jump-latest")
    assert "opacity: 0" in chip_css
    assert "transition: opacity 120ms" in chip_css
    shown_css = _block(DESKTOP_CSS, '.jump-latest[data-shown="true"]')
    assert "opacity: 1" in shown_css
    assert "jumpChipAppear" in DESKTOP_APP
    assert "jumpChipShown" in DESKTOP_APP
    assert "jumpChipDismiss" in DESKTOP_APP
    assert "jumpChipFadeMs" in DESKTOP_APP
    assert "requestAnimationFrame" in DESKTOP_APP
    assert "data-shown={jumpPaint.shown ? \"true\" : \"false\"}" in DESKTOP_APP


def test_reduce_motion_instant() -> None:
    fade_ios = _fn(STICK, "jumpChipFadeSeconds(reduceMotion: Bool)")
    assert "reduceMotion ? 0" in fade_ios
    anim = _fn(STICK, "jumpChipAnimation(reduceMotion: Bool)")
    assert "reduceMotion ? nil" in anim
    appear = _fn(STICK, "jumpChipAppear(reduceMotion: Bool)")
    assert "shown: reduceMotion" in appear
    dismiss = _fn(STICK, "jumpChipDismiss(reduceMotion: Bool)")
    assert "reduceMotion ? .hidden" in dismiss
    assert "accessibilityReduceMotion" in CHAT
    fade_js = _fn(DESKTOP_STICK, "jumpChipFadeMs")
    assert "reduceMotion ? 0" in fade_js
    appear_js = _fn(DESKTOP_STICK, "jumpChipAppear")
    assert "shown: reduceMotion" in appear_js
    dismiss_js = _fn(DESKTOP_STICK, "jumpChipDismiss")
    assert "JUMP_CHIP_HIDDEN" in dismiss_js
    assert "@media (prefers-reduced-motion: reduce)" in DESKTOP_CSS
    reduce_idx = DESKTOP_CSS.find("@media (prefers-reduced-motion: reduce)")
    jump_reduce = None
    from_idx = 0
    needle = "@media (prefers-reduced-motion: reduce)"
    while True:
        idx = DESKTOP_CSS.find(needle, from_idx)
        if idx < 0:
            break
        start = DESKTOP_CSS.find("{", idx)
        depth = 0
        end = start
        for i in range(start, len(DESKTOP_CSS)):
            if DESKTOP_CSS[i] == "{":
                depth += 1
            elif DESKTOP_CSS[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        block = DESKTOP_CSS[idx : end + 1]
        if ".jump-latest" in block:
            jump_reduce = block
            break
        from_idx = end + 1
    assert jump_reduce, "missing desktop Reduce Motion rule for Jump chip"
    assert "transition: none" in jump_reduce
    assert "prefers-reduced-motion: reduce" in DESKTOP_APP
    _ = reduce_idx


def test_jump_click_esc_behavior_unchanged() -> None:
    chip = _jump_chip()
    assert "snapToBottom(proxy)" in chip
    assert "StopGenerating.shouldFocusComposerAfterAbort" in chip
    assert "hardwareKeyboardAttached: StopGenerating.hardwareKeyboardAttached" in chip
    assert "wantsComposerFocus = true" in chip
    assert "composerFocused = true" not in chip
    desktop_jump = _desktop_on_jump()
    assert "onJumpToLatest()" in desktop_jump
    assert "scrollTop = el.scrollHeight" in desktop_jump
    assert "shouldFocusComposerAfterAbort()" in desktop_jump
    assert "focusComposer()" in desktop_jump
    assert "onClick={onJumpLatest}" in DESKTOP_APP
    assert 'className="jump-latest"' in DESKTOP_APP
    jump_at = desktop_jump.index("onJumpToLatest()")
    scroll_at = desktop_jump.index("scrollTop = el.scrollHeight")
    gate_at = desktop_jump.index("shouldFocusComposerAfterAbort()")
    focus_at = desktop_jump.index("focusComposer()")
    assert jump_at < scroll_at < gate_at < focus_at
    from_jump = _fn(MODEL, "jumpToLatestFromEscape(composing: Bool, showJump: Bool)")
    assert "StickToBottom.escapeJumps(" in from_jump
    assert "stickBump += 1" in from_jump
    assert "shouldFocusComposerAfterAbort(hardwareKeyboardAttached: true)" in from_jump
    assert "wantsComposerFocus = true" in from_jump
    assert "stopGenerating()" not in from_jump
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "model.jumpToLatestFromEscape(composing: composing, showJump: showJump)" in CHAT
    jump_at_app = DESKTOP_APP.find("escapeJumpsToLatest({")
    jump_block = DESKTOP_APP[jump_at_app : jump_at_app + 500]
    assert "onJumpLatest()" in jump_block
    desktop_stop_at = DESKTOP_APP.find("escapeStopsGenerating({")
    desktop_jump_at = DESKTOP_APP.find("escapeJumpsToLatest({")
    assert desktop_stop_at >= 0 and desktop_jump_at > desktop_stop_at
    stop_branch = DESKTOP_APP[desktop_stop_at:desktop_jump_at]
    assert "onStopGenerating()" in stop_branch
    assert "return;" in stop_branch
    assert "onJumpLatest()" not in stop_branch


def test_openapi_stays_0180_and_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert 'static let jumpLabel = "Jump to latest"' in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static func insert(" in OPT
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func whileGenerating(busy: Bool)" in MUTED
    assert "N tools" in COMPACT or "toolsLabel" in COMPACT
    assert "static func shouldRenderMarkdown" in PLAIN
    assert "shouldFocusComposerAfterAbort" in STOP
    assert "escapeJumps" in STICK
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.63" in OPENAPI
    assert "v0.63" in RUNTIME_OPENAPI
    assert "v0.63" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "/v1/cancel" not in STICK
    assert "/v1/cancel" not in MODEL
    assert "/v1/cancel" not in DESKTOP_STICK
    assert "computerPane.ts" not in STICK
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert not DESKTOP_PANE.exists()
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "escapeJumpsToLatest" in DESKTOP_APP
    assert "shouldFocusComposerAfterAbort" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP
    assert "copiedFeedbackLabel" in DESKTOP_APP
    assert "WAITING_DOT" in DESKTOP_APP


def main() -> int:
    tests = [
        test_fade_120ms_on_appear_and_dismiss,
        test_reduce_motion_instant,
        test_jump_click_esc_behavior_unchanged,
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
