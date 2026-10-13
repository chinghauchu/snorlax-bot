#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.86 Copy on user-RIGHT kind=message.

Desktop hover shows the same muted 12px Copy LEFT already uses.
Click copies that message text 1:1. Copied sits beside Copy for
1.2s; the Copy label stays. No toast. Hidden while that bubble is
still sending. iOS long-press offers Copy. No Regenerate on user
bubbles. No new HTTP. OpenAPI stays 0.18.0. Clipboard image paste
(v0.30) and the sticky day header (v0.85) stay. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
DESKTOP_ACTIONS = (ROOT / "desktop" / "src" / "messageActions.ts").read_text(
    encoding="utf-8"
)
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.86 user-RIGHT Copy (hover a user-RIGHT kind=message to show a muted "
    "12px Copy that copies that message text 1:1; Copied sits beside Copy for "
    "1.2s and the Copy label stays; no toast; hidden while that bubble is "
    "still sending; iOS long-press offers Copy; no Regenerate on user bubbles; "
    "no new HTTP)"
)


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def user_copy_pending(message_id: str, busy: bool, failed: bool) -> bool:
    return busy and message_id.startswith("local-") and not failed


def show_user_copy(is_user: bool, kind_message: bool, pending: bool) -> bool:
    if not (is_user and kind_message):
        return False
    return not pending


def test_settled_user_message_only() -> None:
    assert show_user_copy(True, True, False) is True
    assert show_user_copy(True, True, True) is False
    assert show_user_copy(False, True, False) is False
    assert show_user_copy(True, False, False) is False
    assert user_copy_pending("local-1", True, False) is True
    assert user_copy_pending("local-1", False, False) is False
    assert user_copy_pending("local-1", True, True) is False
    assert user_copy_pending("server-1", True, False) is False
    assert "func showsUserCopy(" in CHAT
    assert "message.isFromUser, message.isKindMessage" in CHAT
    assert "return !pending" in CHAT
    assert "OptimisticSend.isOptimistic(message.id)" in CHAT
    assert "model.failedSend(id: message.id) == nil" in CHAT
    assert "export function userCopyPending(" in DESKTOP_ACTIONS
    assert "export function showUserCopy(" in DESKTOP_ACTIONS
    assert 'id.startsWith(OPTIMISTIC_ID_PREFIX)' in DESKTOP_ACTIONS or (
        "isOptimisticId" in DESKTOP_ACTIONS
    )


def test_long_press_copy_without_regenerate() -> None:
    assert "Self.showsUserCopy(" in CHAT
    regen = _slice(CHAT, "func showsRegenerate(", "func showsSpeak(")
    assert "showsCopy(" in regen
    assert "showsUserCopy" not in regen
    speak = _slice(CHAT, "func showsSpeak(", "private struct ComposerBar")
    assert "showsCopy(" in speak
    assert "showsUserCopy" not in speak
    menu = _slice(CHAT, "struct BubbleTimestampMenu", "struct AttachmentShareSheet")
    assert 'Button("Copy")' in menu
    assert "if showCopy" in menu
    assert "UIPasteboard.general.string = message.content" in CHAT
    assert "Long-press your message" in SHORTCUTS
    assert "Copy, or " in SHORTCUTS
    assert "RecallDraft.editAsNewMessage" in SHORTCUTS
    control = _slice(DESKTOP_APP, "function UserMessageCopy(", "function AgentSkillRow")
    assert "copyText(content)" in control
    assert "COPY_CONTROL_LABEL" in control
    assert "copiedFeedbackLabel(copied)" in control
    assert "MESSAGE_COPY_FEEDBACK_MS" in control
    assert 'className="message-copied"' in control
    assert "Regenerate" not in control
    assert "onSpeak" not in control
    assert "toast" not in control.lower()
    user = DESKTOP_APP[
        DESKTOP_APP.find('className="bubble user"') : DESKTOP_APP.find(
            "assistant-md", DESKTOP_APP.find('className="bubble user"')
        )
    ]
    assert "<UserMessageCopy content={message.content} />" in user
    assert "showUserCopy(" in user
    assert "Regenerate" not in user


def test_hover_chrome_openapi_roadmap() -> None:
    hidden_at = DESKTOP_CSS.find("\n.turn.right .user-copy {")
    assert hidden_at >= 0
    hidden = DESKTOP_CSS[hidden_at : DESKTOP_CSS.find("}", hidden_at) + 1]
    assert "opacity: 0" in hidden
    assert "pointer-events: none" in hidden
    assert "120ms" in hidden
    shown_at = DESKTOP_CSS.find(".turn.right:hover .user-copy")
    shown = DESKTOP_CSS[shown_at : DESKTOP_CSS.find("}", shown_at) + 1]
    assert "opacity: 1" in shown
    assert ".turn.right:focus-within .user-copy" in shown
    assert ".user-copy.is-copied" in shown
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_user_copy.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in DESKTOP_APP
    assert "/v1/" not in DESKTOP_ACTIONS


def main() -> int:
    tests = [
        test_settled_user_message_only,
        test_long_press_copy_without_regenerate,
        test_hover_chrome_openapi_roadmap,
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
