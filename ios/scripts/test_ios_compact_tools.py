#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.56 iOS compact tool traces.

Within one assistant turn, 2+ consecutive kind=tool lines collapse
client-side into one 12pt muted `N tools` line with a small chevron.
Default collapsed. Tap expands to the existing per-tool lines; tap
again collapses. Single tool unchanged. Live: first tool paints
normally; on the 2nd, swap to collapsed `N tools` and bump N.
kind=widget / approve / connect never fold into the tool stack.
Stick-to-bottom / Jump / multi-bubble gap unchanged. No new HTTP.
OpenAPI stays 0.18.0. Keep v0.47–v0.55 intact. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPACT = (IOS / "CompactToolTraces.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
MUTED = (IOS / "SendMuted.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "compactToolTraces.ts").read_text(
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


def test_two_plus_collapse_to_n_tools() -> None:
    assert "static let collapseAt = 2" in COMPACT
    assert "static let font: CGFloat = 12" in COMPACT
    assert 'return "\\(count) tools"' in COMPACT or "tools" in COMPACT
    assert "static func label(count: Int)" in COMPACT
    label = _fn(COMPACT, "label(count: Int)")
    assert "tools" in label
    assert "static func shouldCollapse(count: Int)" in COMPACT
    collapse = _fn(COMPACT, "shouldCollapse(count: Int)")
    assert "collapseAt" in collapse
    assert "CompactToolTraces.stacks(" in CHAT
    assert "CompactToolTraces.showHeader" in CHAT
    assert "ToolStackHeader(" in CHAT
    assert "collapsedToolsLabel" in DESKTOP
    assert 'return `${count} tools`' in DESKTOP
    assert "className=\"tool-trace tool-stack\"" in DESKTOP_APP
    stack = _block(DESKTOP_CSS, ".tool-stack")
    assert "font-size: 12px" in stack
    assert "color: var(--text-muted)" in stack


def test_single_tool_unchanged() -> None:
    show = _fn(COMPACT, "showHeader")
    assert "shouldCollapse(count: stack.items.count)" in show
    collapsed = _fn(COMPACT, "collapsed(expanded: Set<String>, stackId: String, count: Int)")
    assert "shouldCollapse(count: count)" in collapsed
    assert "return false" in collapsed
    assert "if message.isToolLine" in CHAT
    assert "message.content" in CHAT
    assert "shouldCollapseToolRun(1)" not in DESKTOP or "count >= COLLAPSE_AT" in DESKTOP
    assert "showStackHeader" in DESKTOP_APP
    assert 'className="tool-trace"' in DESKTOP_APP


def test_expand_collapse() -> None:
    assert "static func toggle(expanded: Set<String>, stackId: String)" in COMPACT
    toggle = _fn(COMPACT, "toggle(expanded: Set<String>, stackId: String)")
    assert "next.insert" in toggle
    assert "next.remove" in toggle
    assert "expandedToolStacks" in CHAT
    assert "CompactToolTraces.toggle(" in CHAT
    assert "Image(systemName: \"chevron.right\")" in COMPACT
    assert "rotationEffect(.degrees(expanded ? 90 : 0))" in COMPACT
    assert "toggleExpanded" in DESKTOP_APP
    assert "aria-expanded" in DESKTOP_APP
    chevron = _block(DESKTOP_CSS, ".tool-stack-chevron.open")
    assert "rotate(90deg)" in chevron


def test_live_first_then_bump_n() -> None:
    assert "static func livePaint(" in COMPACT
    paint = _fn(COMPACT, "livePaint")
    assert "shouldCollapse(count: stack.items.count)" in paint
    assert "messageIndexes.isEmpty" in paint or "mixed" in paint
    assert "CompactToolTraces.livePaint(" in CHAT
    assert "livePaint.lines" in CHAT
    assert "livePaint.header" in CHAT
    assert "liveToolPaint" in DESKTOP
    assert "liveToolPaint" in DESKTOP_APP
    assert "first tool paints normally" in DESKTOP


def test_widget_approve_connect_never_fold() -> None:
    assert "static func neverFolds(kind: Message.Kind?)" in COMPACT
    never = _fn(COMPACT, "neverFolds")
    assert ".widget" in never
    assert ".approve" in never
    assert ".connect" in never
    fold = _fn(COMPACT, "isFoldableTool")
    assert ".tool" in fold
    stacks = _fn(COMPACT, "stacks")
    assert "isFoldableTool(kind:" in stacks
    assert "message.isWidget" in CHAT
    assert "message.isApprove" in CHAT
    assert "message.isConnect" in CHAT
    assert "neverFoldsIntoToolStack" in DESKTOP
    assert "isWidget(message)" in DESKTOP_APP
    assert "isApprove(message)" in DESKTOP_APP
    assert "isConnect(message)" in DESKTOP_APP


def test_no_new_http_openapi_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static let sameTurn: CGFloat = 6" in MARKDOWN
    assert "static func insert(" in OPT
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func whileGenerating(busy: Bool)" in MUTED
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.56" in OPENAPI
    assert "v0.56" in RUNTIME_OPENAPI
    assert "v0.56" in DESKTOP_OPENAPI
    assert "0.19" not in OPENAPI.split("version:", 1)[-1][:40]
    assert "/v1/cancel" not in COMPACT
    assert "/v1/cancel" not in CHAT
    assert "/v1/cancel" not in DESKTOP
    assert "/v1/chats/" not in COMPACT
    assert "computerPane.ts" not in COMPACT
    assert "computerPane.ts" not in CHAT
    assert not DESKTOP_PANE.exists()
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP
    assert "JUMP_TO_LATEST_LABEL" in DESKTOP_APP
    assert "className=\"jump-latest\"" in DESKTOP_APP
    left_same = _block(DESKTOP_CSS, ".turn.left.same-sender")
    assert "margin-top: 12px" in left_same
    bubbles = _block(DESKTOP_CSS, ".assistant-bubbles")
    assert "gap: 6px" in bubbles


def main() -> int:
    tests = [
        test_two_plus_collapse_to_n_tools,
        test_single_tool_unchanged,
        test_expand_collapse,
        test_live_first_then_bump_n,
        test_widget_approve_connect_never_fold,
        test_no_new_http_openapi_intact_stack,
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
