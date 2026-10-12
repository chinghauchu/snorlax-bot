#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.80 sidebar last-message preview.

Under each chat or agent name, one muted truncated line of the latest
user or assistant text. Prefer kind=message. Skip tool, widget, approve,
and connect chrome with no useful text. Empty chats show no preview.
The line updates when a send completes or an assistant reply finishes
from messages already in memory. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "LastMessagePreview.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "lastMessagePreview.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.80 sidebar last-message preview (under each chat or agent name, one "
    "muted truncated line of the latest user or assistant text; prefer "
    "kind=message; skip tool, widget, approve, and connect chrome with no "
    "useful text; empty chats show no preview; updates when a send completes "
    "or an assistant reply finishes from messages already in memory; no new HTTP)"
)


def test_preview_rules() -> None:
    assert "static let limit = 120" in SWIFT
    assert "prefer kind=message" in SWIFT
    assert "kind == nil || kind == .message || kind == .handoff" in SWIFT
    assert "case .tool:" in SWIFT
    assert "case .widget:" in SWIFT
    assert "case .approve:" in SWIFT
    assert "case .connect:" in SWIFT
    assert 'return "Image"' in SWIFT
    assert "displayContent" in SWIFT
    assert "userAsk" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "PREVIEW_LIMIT = 120" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_list_and_refresh_from_memory() -> None:
    assert "chatPreviews[agent.id]" in LIST
    assert "lineLimit(1)" in LIST
    assert "truncationMode(.tail)" in LIST
    assert ".foregroundStyle(.secondary)" in LIST
    assert "minHeight: 44" in LIST
    assert "noteChatPreview()" in MODEL
    assert "noteFinishedPreview(" in MODEL
    assert "mainTranscript:" in MODEL
    assert "snapshotMainTranscript" in SWIFT
    assert 'className="row-preview"' in APP
    assert "applyFinishedPreview(" in APP
    assert "rememberChatPreview(" in APP
    assert "snapshotChatPreview(" in APP
    row = LIST.split("private struct AgentRow", 1)[1].split("struct AccountChip", 1)[0]
    assert "chatPreviews" in row
    assert "rosterSubtitle" in row


def test_openapi_stays_0180() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in DESKTOP_OPENAPI
    assert not PANE.exists()
    assert "computerPane.ts" not in LIST
    assert PHRASE in ROADMAP


def main() -> int:
    tests = [
        test_preview_rules,
        test_list_and_refresh_from_memory,
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
