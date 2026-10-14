#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.93 sidebar generating indicator.

While an assistant reply the client started is in flight, that chat's
row shows muted ··· in place of its relative time and a muted Typing…
preview. Draft: still wins the preview for a non-open chat with a
draft, and the dots stay. Reduce Motion paints static dots. The
indicator clears when the reply completes, is Stopped, or errors. If
that chat is not open, the unread dot takes over as today. Pins and
the Unread filter stay. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatGenerating.swift").read_text(encoding="utf-8")
DRAFT = (IOS / "ChatDraftPreview.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatGenerating.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.93 sidebar generating indicator (while an assistant reply the client "
    "started is in flight, that chat's sidebar row shows a small muted "
    "animated ··· in place of its relative time and a muted Typing… preview; "
    "Draft: still wins the preview for a non-open chat with a draft and the "
    "dots stay; Reduce Motion paints static dots; it clears when the reply "
    "completes, is Stopped, or errors, and the unread dot takes over if that "
    "chat is not open; pins and the Unread filter stay; the iOS chat list "
    "matches; no new HTTP)"
)
LIMIT = 120


def one_line(text: str) -> str:
    flat = " ".join(text.split())
    if not flat:
        return ""
    if len(flat) <= LIMIT:
        return flat
    return flat[: LIMIT - 1].rstrip() + "…"


def visible_draft(draft: str | None) -> str | None:
    line = one_line(draft or "")
    return line or None


def row_preview(
    chat_id: str,
    open_chat_id: str | None,
    draft: str | None,
    last_message: str | None,
) -> dict | None:
    last = (last_message or "").strip()
    if not chat_id:
        if not last:
            return None
        return {"kind": "message", "text": last}
    if chat_id != open_chat_id:
        text = visible_draft(draft)
        if text:
            return {"kind": "draft", "prefix": "Draft:", "text": text}
    if not last:
        return None
    return {"kind": "message", "text": last}


def list_line(
    chat_id: str,
    open_chat_id: str | None,
    draft: str | None,
    last_message: str | None,
    generating: bool,
) -> dict | None:
    base = row_preview(chat_id, open_chat_id, draft, last_message)
    if base and base.get("kind") == "draft":
        return base
    if generating and chat_id:
        return {"kind": "typing", "text": "Typing…"}
    return base


def test_precedence() -> None:
    assert list_line("other", "seed", "unsent note", "pong", True) == {
        "kind": "draft",
        "prefix": "Draft:",
        "text": "unsent note",
    }
    assert list_line("seed", "seed", "still typing here", "pong", True) == {
        "kind": "typing",
        "text": "Typing…",
    }
    assert list_line("seed", "seed", "still typing here", "pong", False) == {
        "kind": "message",
        "text": "pong",
    }
    assert list_line("other", "seed", " \n\t", "pong", True)["kind"] == "typing"
    assert list_line("other", "seed", None, None, True) == {
        "kind": "typing",
        "text": "Typing…",
    }
    assert list_line("other", "seed", None, "pong", False) == {
        "kind": "message",
        "text": "pong",
    }
    assert list_line("other", "seed", None, None, False) is None
    assert list_line("", "seed", None, None, True) is None

    assert 'static let hint = "Typing…"' in SWIFT
    assert "WaitingChrome.shouldPulse" in SWIFT
    assert "ChatDraftPreview.row" in SWIFT
    assert "kind == .draft" in SWIFT
    assert "showsDots" in SWIFT
    assert "struct GeneratingDots" in SWIFT
    assert "accessibilityReduceMotion" in SWIFT
    assert "WaitingLabel()" in SWIFT
    assert "Text(WaitingChrome.label)" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'TYPING_HINT = "Typing…"' in DESKTOP
    assert "waitingDotsShouldPulse" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert 'static let prefix = "Draft:"' in DRAFT
    assert "shouldPulse(reduceMotion:" in WAITING


def test_list_wires_indicator_and_keeps_neighbors() -> None:
    assert "GeneratingDots()" in LIST
    assert "ChatGenerating.hint" in LIST
    assert "ChatGenerating.showsDots" in LIST
    assert "model.generatingChatID == agent.id" in LIST
    assert "ChatDraftPreview.prefix" in LIST
    assert "Color.accentColor.opacity(0.72)" in LIST
    assert "muted-accent" in LIST
    assert "ChatListTime.label" in LIST
    assert "TimelineView(.periodic" in LIST
    assert "showsUnreadDot(agent)" in LIST
    assert "toggleChatPin(agent.id)" in LIST
    assert "toggleChatRead(agent.id)" in LIST
    assert "ChatListFilter.groupLabel" in LIST
    assert "ChatPins.groupLabel" in LIST
    assert "swipeActions(edge: .leading" in LIST
    assert "swipeActions(edge: .trailing" in LIST
    assert "var generatingChatID: String?" in MODEL
    assert "generatingChatID = originAgentID" in MODEL
    assert "generatingChatID = agent.id" in MODEL
    assert "generatingChatID = nil" in MODEL
    assert "func chatListPreview(for agentId: String, lastMessage: String?)" in MODEL
    assert "ChatGenerating.line(" in MODEL
    assert "openChatId: onScreenChatID()" in MODEL
    assert "chatDrafts.text(agentId: agentId, threadId: nil)" in MODEL
    assert "lastMessage: lastMessage" in MODEL
    assert "generating: generatingChatID == agentId" in MODEL
    assert "func toggleChatRead(_ id: String)" in MODEL
    assert "func toggleChatPin(_ id: String)" in MODEL
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in LIST
    assert "chatRowPreview(" in APP
    assert "chatListLine(" in APP
    assert "activeGeneratingChat({ busy: true, chatId: streamChatId })" in APP
    assert "activeGeneratingChat({ busy: false, chatId: streamChatId })" in APP
    assert 'className="row-generating waiting-dots"' in APP
    assert 'className="row-typing"' in APP
    assert 'className="row-draft-prefix"' in APP
    assert 'className="row-time"' in APP
    assert 'className="unread-dot"' in APP
    assert "noteReplyUnread(streamChatId)" in APP
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.93 " in ROADMAP
    assert "sidebar generating indicator" in ROADMAP
    assert "## 94. v0.93" in SPEC
    assert "Draft: still wins" in SPEC
    assert "python3 ios/scripts/test_ios_chat_generating.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_precedence,
        test_list_wires_indicator_and_keeps_neighbors,
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
    raise SystemExit(main())
