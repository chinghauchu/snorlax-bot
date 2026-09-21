#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.57 iOS mid-stream plaintext.

While a LEFT kind=message is mid-stream (growing bubble + caret): paint
plain text only — no live markdown, mermaid, or math. On complete or
Stop (partial stays completed): render markdown once (bold/lists/code/
links + mermaid + math), then apply the existing blank-line multi-bubble
split. Copy / Speak / Regenerates still only on the last bubble after
complete. ··· waiting, caret, stick-to-bottom, compact tools unchanged.
No new HTTP. OpenAPI stays 0.18.0. Keep v0.47–v0.56 intact. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
MUTED = (IOS / "SendMuted.swift").read_text(encoding="utf-8")
COMPACT = (IOS / "CompactToolTraces.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "midStreamPlaintext.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(
    encoding="utf-8"
)
DESKTOP_BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(
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


def test_mid_stream_is_plaintext_no_markdown_mermaid_math() -> None:
    show = _fn(PLAIN, "shouldRenderMarkdown")
    assert "completed" in show
    desktop = _fn(DESKTOP, "shouldRenderMarkdown")
    assert "return opts.completed" in desktop
    assert "MidStreamPlaintext.shouldRenderMarkdown(completed: completed)" in CHAT
    assert "MidStreamPlaintextView(text: part)" in CHAT
    assert "shouldRenderMarkdown({ completed })" in DESKTOP_APP
    assert 'className="assistant-plain"' in DESKTOP_APP
    live = CHAT[
        CHAT.find("MidStreamPlaintext.shouldRenderMarkdown") : CHAT.find(
            "if showCopy || showSpeak"
        )
    ]
    assert "MidStreamPlaintextView" in live
    assert "MermaidFence" not in live
    assert "MathBlock" not in live
    assert "MathInline" not in live
    assert "AttributedString(markdown:" not in live
    plain_branch = DESKTOP_APP[
        DESKTOP_APP.find("className=\"assistant-plain\"") : DESKTOP_APP.find(
            "showAssistantCopy"
        )
    ]
    assert "<MarkdownBody" not in plain_branch
    assert "MermaidFence" not in plain_branch
    assert "MathNode" not in plain_branch
    assert ".assistant-plain {" in DESKTOP_CSS
    assert "white-space: pre-wrap" in DESKTOP_CSS[
        DESKTOP_CSS.find(".assistant-plain {") :
    ]


def test_complete_or_stop_renders_markdown_then_split() -> None:
    assert "AssistantMarkdown(" in CHAT
    assert "completed: completed" in CHAT
    assert "completed: !(model.isSending && index == liveAssistantIdx)" in CHAT
    assert "MarkdownSplit.bubbles(in: message.displayContent, completed: completed)" in CHAT
    assert "if !completed { return [text] }" in MARKDOWN
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "<MarkdownBody" in DESKTOP_APP
    assert "completed={completed}" in DESKTOP_APP
    assert "shouldOfferStop(busy)" in DESKTOP_APP
    assert "onStopGenerating" in DESKTOP_APP
    assert 'static let label = "Stop"' in STOP
    assert "StopGenerating.shouldOffer(busy: model.isSending)" in CHAT
    assert "shouldRenderMermaid" in DESKTOP_BODY
    assert "shouldRenderMath" in DESKTOP_BODY
    assert "react-markdown" in DESKTOP_BODY
    assert "completed && MarkdownSplit.isMermaidLanguage(language)" in MARKDOWN
    assert "completed && closed" in MARKDOWN


def test_actions_only_on_last_bubble_after_complete() -> None:
    bubbles_for = CHAT.find("ForEach(Array(leftBubbles.enumerated())")
    assert bubbles_for > 0
    chunk = CHAT[bubbles_for : bubbles_for + 2200]
    actions = chunk.find("if showCopy || showSpeak")
    assert actions > 0
    for_each = chunk[:actions]
    assert "Button(copied" not in for_each
    assert 'Button("Regenerate")' not in for_each
    assert "Speak.label" not in for_each
    md = DESKTOP_APP[
        DESKTOP_APP.find('className="assistant-md"') : DESKTOP_APP.find(
            'className="assistant-md"'
        )
        + 4200
    ]
    bubble_block = md[
        md.find("assistant-bubbles") : md.find("showAssistantCopy")
    ]
    assert "MessageActions" not in bubble_block
    assert "showAssistantCopy" in md
    assert "<MessageActions" in md


def test_waiting_caret_stick_compact_tools_unchanged() -> None:
    wait = _fn(WAITING, "shouldShow")
    caret = _fn(CARET, "shouldShow")
    assert "!hasFirstToken" in wait
    assert "hasFirstToken" in caret
    assert 'static let label = "···"' in WAITING
    assert "StreamingCaretView()" in CHAT
    assert "className=\"streaming-caret\"" in DESKTOP_APP
    assert "className=\"waiting\"" in DESKTOP_APP
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func insert(" in OPT
    assert "static func whileGenerating" in MUTED
    assert "N tools" in COMPACT or "toolsLabel" in COMPACT
    assert "compactToolTraces" in DESKTOP_APP or "ToolStackHeader" in DESKTOP_APP
    assert ".assistant-bubbles {" in DESKTOP_CSS
    assert "gap: 6px" in DESKTOP_CSS[DESKTOP_CSS.find(".assistant-bubbles {") :]


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.57" in OPENAPI
    assert "v0.57" in RUNTIME_OPENAPI
    assert "v0.57" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "computerPane.ts" not in PLAIN
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in DESKTOP
    assert not DESKTOP_PANE.exists()
    assert "/v1/chats/" not in PLAIN
    assert "/v1/chats/" not in DESKTOP
    assert "/v1/cancel" not in PLAIN
    assert "/v1/cancel" not in DESKTOP


def main() -> int:
    tests = [
        test_mid_stream_is_plaintext_no_markdown_mermaid_math,
        test_complete_or_stop_renders_markdown_then_split,
        test_actions_only_on_last_bubble_after_complete,
        test_waiting_caret_stick_compact_tools_unchanged,
        test_openapi_stays_0180_and_no_computer_pane,
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
