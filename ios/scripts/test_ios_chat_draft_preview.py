#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.91 draft hint in the chat list.

A chat other than the one currently open, with unsent top-level
composer text from the v0.64/v0.69 drafts, shows a muted-accent
Draft: prefix and that text on the v0.80 preview line. Whitespace-only
drafts do not count. Clearing or sending restores the last message.
The open chat's row keeps its normal preview. Relative time, the
unread dot, the Unread filter, pins, and mark unread stay. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "ChatDraftPreview.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
DRAFTS = (IOS / "ChatDrafts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "chatDraftPreview.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.91 draft hint in the chat list (when a chat other than the one "
    "currently open has unsent composer text from the v0.64/v0.69 per-chat "
    "drafts, its v0.80 last-message preview reads a muted-accent Draft: "
    "prefix followed by that draft on one truncated line; whitespace-only "
    "drafts do not count; clearing or sending the draft restores the "
    "last-message preview; the open chat's row keeps its normal preview; "
    "relative time, the unread dot, the Unread filter, pins, and mark "
    "unread stay; no new HTTP)"
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
    open = chat_id == open_chat_id
    if not open:
        text = visible_draft(draft)
        if text:
            return {"kind": "draft", "prefix": "Draft:", "text": text}
    if not last:
        return None
    return {"kind": "message", "text": last}


def test_draft_rules() -> None:
    assert visible_draft(None) is None
    assert visible_draft("") is None
    assert visible_draft("   \n\t") is None
    assert visible_draft("hello\n\nthere") == "hello there"
    long = "word " * 40
    text = visible_draft(long)
    assert text == one_line(long)
    assert text is not None and text.endswith("…") and len(text) <= LIMIT

    assert row_preview("other", "seed", "unsent note", "pong") == {
        "kind": "draft",
        "prefix": "Draft:",
        "text": "unsent note",
    }
    assert row_preview("other", None, "unsent note", "pong")["kind"] == "draft"
    assert row_preview("other", "seed", "only a draft", None)["kind"] == "draft"
    assert row_preview("seed", "seed", "unsent note", "pong") == {
        "kind": "message",
        "text": "pong",
    }
    assert row_preview("seed", "seed", "unsent note", "  ") is None
    assert row_preview("other", "seed", " \n\t", "pong") == {
        "kind": "message",
        "text": "pong",
    }
    assert row_preview("other", "seed", "", "pong")["kind"] == "message"
    assert row_preview("other", "seed", "", "") is None
    assert row_preview("", "", "ghost", "pong") == {
        "kind": "message",
        "text": "pong",
    }

    assert 'static let prefix = "Draft:"' in SWIFT
    assert "LastMessagePreview.oneLine" in SWIFT
    assert "nil thread" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'DRAFT_PREFIX = "Draft:"' in DESKTOP
    assert "oneLine" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "static let storageKey = \"snorlax.chatDrafts\"" in DRAFTS


def test_list_wires_hint_and_keeps_neighbors() -> None:
    assert "model.chatListPreview(" in LIST
    assert "lastMessage: model.chatPreviews[agent.id]" in LIST
    assert "ChatDraftPreview.prefix" in LIST
    assert "Color.accentColor.opacity(0.72)" in LIST
    assert "muted-accent" in LIST
    assert "lineLimit(1)" in LIST
    assert "truncationMode(.tail)" in LIST
    assert "ChatListTime.label" in LIST
    assert "showsUnreadDot(agent)" in LIST
    assert "toggleChatPin(agent.id)" in LIST
    assert "toggleChatRead(agent.id)" in LIST
    assert "ChatListFilter.groupLabel" in LIST
    assert "ChatPins.groupLabel" in LIST
    assert "swipeActions(edge: .leading" in LIST
    assert "swipeActions(edge: .trailing" in LIST
    assert "func chatListPreview(for agentId: String, lastMessage: String?)" in MODEL
    assert "openChatId: onScreenChatID()" in MODEL
    assert "chatDrafts.text(agentId: agentId, threadId: nil)" in MODEL
    assert "lastMessage: lastMessage" in MODEL
    assert "func toggleChatRead(_ id: String)" in MODEL
    assert "func toggleChatPin(_ id: String)" in MODEL
    assert "chatDrafts.clear(" in MODEL
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in LIST
    assert "chatRowPreview(" in APP
    assert "openChatId: activeId" in APP
    assert "chatDrafts.current.get(agent.id, null)" in APP
    assert 'className="row-draft-prefix"' in APP
    assert 'className="row-time"' in APP
    assert 'className="unread-dot"' in APP
    assert "row-pin" in APP
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.91 " in ROADMAP
    assert "## 92. v0.91" in SPEC
    assert "python3 ios/scripts/test_ios_chat_draft_preview.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_draft_rules,
        test_list_wires_hint_and_keeps_neighbors,
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
