#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.28 queue a follow-up while a reply is generating.

Enter or Send while a client-started reply is in flight holds the
composer text as a muted Queued row. Rows are not combined. The oldest
row is sent through the existing send path when that reply settles,
including Stop. Later rows wait, one per completed reply. The queue is
per chat for the session. A failed queued send drops it and restores
the text. No new HTTP. OpenAPI stays 0.18.0.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "QueuedSend.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
QUOTES = (IOS / "QuoteJump.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "queuedSend.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.28 queue a follow-up while a reply is generating"


def test_queue_logic_matches() -> None:
    assert 'static let label = "Queued"' in SWIFT
    assert 'static let removeLabel = "Remove queued message"' in SWIFT
    assert "static func canQueue" in SWIFT
    assert "static func dequeue" in SWIFT
    assert "static func shouldFlush" in SWIFT
    assert "fromQueue && failed" in SWIFT
    assert 'export const QUEUED_LABEL = "Queued"' in DESKTOP
    assert "export function dequeueFollowUp" in DESKTOP
    assert "export function shouldFlushQueue" in DESKTOP
    assert "if (input.fromQueue && input.failed) return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP


def test_ios_wires_queue_above_composer() -> None:
    assert "func queueFollowUp()" in MODEL
    assert "func settleQueuedSend" in MODEL
    assert "quoteJumps.takePending" in MODEL
    assert "quoteJumps.commitOwned" in MODEL
    assert "quoteJumps.restorePending" in MODEL
    assert "QueuedSend.label" in CHAT
    assert "QueuedSend.removeLabel" in CHAT
    assert "QueuedSend.listLabel" in CHAT
    assert "model.queueFollowUp()" in CHAT
    assert "onReturnWhileMuted" in CHAT
    assert "onReturnWhileMuted?()" in COMPOSER
    send_muted = COMPOSER.split("if sendMuted", 1)[1].split("onReturnSend?()", 1)[0]
    assert "onReturnWhileMuted?()" in send_muted
    assert "super.pressesBegan" not in send_muted
    assert "func takePending" in QUOTES
    assert "func commitOwned" in QUOTES
    assert "className=\"queued-follow-ups\"" in APP
    assert "enterQueuesFollowUp" in APP
    assert "fromQueue: true" in APP
    block = CSS[CSS.find(".queued-follow-ups") : CSS.find(".queued-remove") + 80]
    assert "transition" not in block
    assert "animation" not in block


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.28 " in ROADMAP
    assert "## 128. v1.28" in SPEC
    assert "test_ios_queued_send.py" in CI
    assert "queuedSend.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_queue_logic_matches()
    test_ios_wires_queue_above_composer()
    test_docs_and_openapi()
    print("ios queued send ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
