#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.61 iOS Copied feedback.

On Copy of a completed LEFT kind=message, show muted 12pt Copied
beside the Copy control for 1.2s, then dismiss. Copy stays in place
and clickable (do not replace the Copy label). No toast overlay, no
chat layout jump. Speak / Regenerate unchanged. No new HTTP. OpenAPI
stays 0.18.0. Keep v0.47–v0.60 intact. Never reintroduce
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
SPEAK = (IOS / "Speak.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
DESKTOP_ACTIONS = (ROOT / "desktop" / "src" / "messageActions.ts").read_text(
    encoding="utf-8"
)


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def _copy_cluster() -> str:
    btn = CHAT.find('Button("Copy")')
    if btn < 0:
        raise AssertionError("missing Button(\"Copy\")")
    start = CHAT.rfind("HStack(spacing: 6)", 0, btn)
    if start < 0:
        raise AssertionError("missing Copy HStack(spacing: 6)")
    end = CHAT.find("if showSpeak", btn)
    if end < 0:
        raise AssertionError("missing if showSpeak after Copy")
    return CHAT[start:end]


def test_copy_shows_muted_copied_beside_control_for_1_2s() -> None:
    copy_block = _copy_cluster()
    assert 'Button("Copy")' in copy_block
    assert 'copied ? "Copied" : "Copy"' not in CHAT
    assert 'Text("Copied")' in copy_block
    assert "1_200_000_000" in copy_block
    assert "1_500_000_000" not in CHAT
    assert ".font(.system(size: 12))" in copy_block
    assert "foregroundStyle(.secondary)" in copy_block
    assert "UIPasteboard.general.string = message.content" in copy_block
    assert "HStack(spacing: 6)" in copy_block
    assert "showsCopy" in CHAT
    assert "MESSAGE_COPY_FEEDBACK_MS = 1200" in DESKTOP_ACTIONS
    assert "copiedFeedbackLabel" in DESKTOP_APP
    assert 'className="message-copied"' in DESKTOP_APP
    assert "{COPY_CONTROL_LABEL}" in DESKTOP_APP
    assert 'copied ? "Copied" : "Copy"' not in DESKTOP_APP[
        DESKTOP_APP.find("function MessageActions(") : DESKTOP_APP.find(
            "function AgentSkillRow"
        )
    ]
    copied_css = DESKTOP_CSS[
        DESKTOP_CSS.find("\n.message-copied {") : DESKTOP_CSS.find(
            "}", DESKTOP_CSS.find("\n.message-copied {")
        )
        + 1
    ]
    assert "font-size: 12px" in copied_css
    assert "color: var(--text-muted)" in copied_css


def test_copy_label_not_replaced_no_toast_no_layout_jump() -> None:
    copy_block = _copy_cluster()
    assert 'Button("Copy")' in copy_block
    assert "buttonStyle(.plain)" in copy_block
    assert "toast" not in copy_block.lower()
    assert "toast" not in CHAT.lower()
    actions = _slice(DESKTOP_APP, "function MessageActions(", "function AgentSkillRow")
    assert "toast" not in actions.lower()
    assert "position: fixed" not in actions
    copied_css = DESKTOP_CSS[
        DESKTOP_CSS.find("\n.message-copied {") : DESKTOP_CSS.find(
            "}", DESKTOP_CSS.find("\n.message-copied {")
        )
        + 1
    ]
    assert "position: fixed" not in copied_css
    assert "position: absolute" not in copied_css
    row = DESKTOP_CSS[
        DESKTOP_CSS.find("\n.message-actions {") : DESKTOP_CSS.find(
            "}", DESKTOP_CSS.find("\n.message-actions {")
        )
        + 1
    ]
    assert "flex-direction: row" in row
    assert "align-items: center" in row
    # Same 12px row — Copied is inline beside Copy, not a new line / overlay.
    assert "HStack(spacing: 12)" in CHAT
    assert "HStack(spacing: 6)" in copy_block


def test_speak_and_regenerate_unchanged() -> None:
    assert "Speak.label(speaking)" in CHAT
    assert 'Button("Regenerate")' in CHAT
    assert "model.toggleSpeak(message: message)" in CHAT
    assert "model.regenerate()" in CHAT
    assert "func toggleSpeak" in MODEL or "func toggleSpeak(" in MODEL
    assert "func regenerate()" in MODEL
    copy_block = _copy_cluster()
    assert "Speak.label" not in copy_block
    assert "Regenerate" not in copy_block
    speak_block = _slice(CHAT, "if showSpeak", "if showRegenerate")
    assert "Speak.label(speaking)" in speak_block
    assert 'Text("Copied")' not in speak_block
    regen_block = _slice(CHAT, "if showRegenerate", "if isUser, let jump")
    assert 'Button("Regenerate")' in regen_block
    assert 'Text("Copied")' not in regen_block
    actions = _slice(DESKTOP_APP, "function MessageActions(", "function AgentSkillRow")
    assert "speakLabel(speaking)" in actions
    assert "showRegenerate" in actions
    assert ">Regenerate<" in actions.replace(" ", "") or "Regenerate" in actions
    assert "static func label(" in SPEAK or "static func label" in SPEAK


def test_no_new_http_openapi_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert 'static let jumpLabel = "Jump to latest"' in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func insert(" in OPT
    assert "static func whileGenerating" in MUTED
    assert "shouldFocusComposerAfterAbort" in STOP
    assert "escapeJumps" in STICK
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.61" in OPENAPI
    assert "v0.61" in RUNTIME_OPENAPI
    assert "v0.61" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "/v1/cancel" not in CHAT
    assert "/v1/chats/" not in CHAT
    assert "/v1/cancel" not in DESKTOP_APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in DESKTOP_ACTIONS
    assert not DESKTOP_PANE.exists()
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "escapeJumpsToLatest" in DESKTOP_APP
    assert "shouldFocusComposerAfterAbort" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP
    assert 'from "./compactToolTraces"' in DESKTOP_APP or "from './compactToolTraces'" in DESKTOP_APP
    assert 'from "./midStreamPlaintext"' in DESKTOP_APP or "from './midStreamPlaintext'" in DESKTOP_APP
    assert "UIKeyCommand.inputEscape" in COMPOSER


def main() -> int:
    tests = [
        test_copy_shows_muted_copied_beside_control_for_1_2s,
        test_copy_label_not_replaced_no_toast_no_layout_jump,
        test_speak_and_regenerate_unchanged,
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
