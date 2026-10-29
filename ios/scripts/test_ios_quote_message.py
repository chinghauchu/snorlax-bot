#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.17 quote a whole message.

A settled user message with text, and a completed assistant reply
with text, can be quoted into the composer on desktop and iOS.
A text selection still quotes only the selection. Nothing is sent.
No new HTTP. OpenAPI stays 0.18.0.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "QuoteMessage.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "quoteMessage.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.17 quote a whole message"


def offers(
    from_user: bool,
    kind_message: bool,
    content: str,
    completed: bool,
    pending: bool,
) -> bool:
    if pending or not kind_message:
        return False
    if not from_user and not completed:
        return False
    body = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    return len(body) > 0


def test_rules() -> None:
    user = dict(
        from_user=True,
        kind_message=True,
        content="earlier prompt",
        completed=True,
        pending=False,
    )
    assert offers(**user) is True
    assert offers(**{**user, "from_user": False}) is True
    assert offers(**{**user, "pending": True}) is False
    assert offers(**{**user, "content": ""}) is False
    assert offers(**{**user, "content": " \n\t"}) is False
    assert offers(**{**user, "kind_message": False}) is False
    assert offers(**{**user, "from_user": False, "completed": False}) is False
    assert offers(**{**user, "from_user": True, "completed": False}) is True
    assert 'static let label = "Quote"' in SWIFT
    assert 'static let accessibilityLabel = "Quote message"' in SWIFT
    assert "static func offers(" in SWIFT
    assert "QuoteSelection.block(content) != nil" in SWIFT
    assert 'export const QUOTE_MESSAGE_LABEL = "Quote"' in DESKTOP
    assert 'export const QUOTE_MESSAGE_ARIA = "Quote message"' in DESKTOP
    assert "export function offersQuoteMessage" in DESKTOP
    assert "export function quoteMessageSourceId" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in DESKTOP
    assert "computerPane.ts" not in SWIFT


def test_clients_quote_the_whole_message() -> None:
    assert "func quoteMessageIntoComposer" in MODEL
    assert "QuoteSelection.append(draft: draft, selection: text)" in MODEL
    assert "wantsComposerFocus = true" in MODEL
    assert "quoteJumps.note(" in MODEL
    assert "computerTakeoverOpen" in MODEL
    insert = MODEL.split("func quoteMessageIntoComposer(", 1)[1].split(
        "func clearRecallFromEscape(", 1
    )[0]
    assert "send(" not in insert
    assert "/v1/" not in insert
    assert "QuoteMessage.offers(" in CHAT
    assert "!message.isToolLine" in CHAT
    assert "!message.isHandoffRoot" in CHAT
    assert "OptimisticSend.isOptimistic(message.id)" in CHAT
    assert "model.failedSend(id: message.id) == nil" in CHAT
    assert "showQuoteMessage: offersWholeQuote" in CHAT
    assert "model.quoteMessageIntoComposer(message.content, sourceId: message.id)" in CHAT
    assert "Button(QuoteSelection.label)" in CHAT
    assert "Button(QuoteMessage.label)" in CHAT
    assert "QuoteSelection.menuSelection() == nil" in CHAT
    assert "QuoteMessage.accessibilityLabel" in CHAT
    assert "Quote the whole message" in SHORTCUTS
    assert "Select text, then Quote" in SHORTCUTS
    assert "function quoteMessageIntoComposer(" in APP
    assert "appendQuoteToDraft(draftRef.current, text)" in APP
    assert "quoteJumps.current.note(active.id, threadId, text, messageId)" in APP
    assert "<QuoteMessageButton" in APP
    assert "fromUser={false}" in APP
    assert "data-reading-id={message.id}" in APP
    user = APP.split("function UserMessageCopy(", 1)[1].split("function AgentSkillRow", 1)[0]
    assert "<QuoteMessageButton" in user
    assert "fromUser={false}" not in user
    assert "Regenerate" not in user
    assert "onSpeak" not in user
    desktop_user = APP.split('className="bubble user"', 1)[1].split(
        'className="assistant-md"', 1
    )[0]
    assert "Regenerate" not in desktop_user


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 217. v2.17" in SPEC
    assert "OpenAPI stays **0.18.0**" in SPEC
    assert "python3 ios/scripts/test_ios_quote_message.py" in CI
    assert "src/quoteMessage.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


if __name__ == "__main__":
    test_rules()
    test_clients_quote_the_whole_message()
    test_openapi_roadmap_ci_no_computer_pane()
    print("ios quote message ok")
    sys.exit(0)
