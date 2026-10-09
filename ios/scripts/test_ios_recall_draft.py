#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.68 recall the latest user message into the composer.

Desktop: Up-arrow in an empty composer (IME idle) fills the latest
user kind=message as an editable draft, caret at the end. Escape or
clearing the field restores empty. Do not recall when the composer
already has text. Stop still wins while generating.

iOS: long-press the user's own most recent bubble and choose
"Edit as new message" (added beside the v0.65 timestamp row).
Hardware Up-arrow uses the same empty-composer rule.

No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "RecallDraft.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_TS = (ROOT / "desktop" / "src" / "recallDraft.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.68 recall last message (empty composer Up-arrow or iOS Edit as new "
    "message puts the latest user text in the composer; Escape or clearing "
    "restores empty; no recall while typing or IME; no new HTTP)"
)


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def latest_user_text(rows: list[dict]) -> str | None:
    for row in reversed(rows):
        if (
            row.get("from_user")
            and row.get("kind_message")
            and row.get("content")
        ):
            return row["content"]
    return None


def arrow_up_recalls(composer_text: str, composing: bool) -> bool:
    return (not composing) and composer_text == ""


def escape_clears(
    armed: bool,
    composing: bool,
    busy: bool,
    pending_widget: bool = False,
    pending_approve: bool = False,
    pending_connect: bool = False,
) -> bool:
    return (
        armed
        and not composing
        and not busy
        and not pending_widget
        and not pending_approve
        and not pending_connect
    )


def armed_after_edit(text: str, was_armed: bool) -> bool:
    return was_armed and len(text) > 0


def test_rules_match_desktop() -> None:
    rows = [
        {"from_user": True, "kind_message": True, "content": "first"},
        {"from_user": False, "kind_message": True, "content": "reply"},
        {"from_user": True, "kind_message": False, "content": "Watched clip"},
        {"from_user": True, "kind_message": True, "content": ""},
        {"from_user": True, "kind_message": True, "content": "second"},
    ]
    assert latest_user_text(rows) == "second"
    assert latest_user_text(rows[:3]) == "first"
    assert latest_user_text([]) is None
    assert arrow_up_recalls("", False) is True
    assert arrow_up_recalls("hi", False) is False
    assert arrow_up_recalls("", True) is False
    assert escape_clears(True, False, False) is True
    assert escape_clears(False, False, False) is False
    assert escape_clears(True, True, False) is False
    assert escape_clears(True, False, True) is False
    assert escape_clears(True, False, False, pending_widget=True) is False
    assert escape_clears(True, False, False, pending_approve=True) is False
    assert escape_clears(True, False, False, pending_connect=True) is False
    assert armed_after_edit("", True) is False
    assert armed_after_edit("edited", True) is True
    assert armed_after_edit("typed", False) is False
    assert 'static let editAsNewMessage = "Edit as new message"' in SWIFT
    assert "EDIT_AS_NEW_MESSAGE" in DESKTOP_TS
    assert "Edit as new message" in DESKTOP_TS
    assert "static func latestText" in SWIFT
    assert "static func latestIndex" in SWIFT
    assert "static func arrowUpRecalls" in SWIFT
    assert "static func escapeClears" in SWIFT
    assert "static func armedAfterEdit" in SWIFT
    assert "function arrowUpRecalls" in DESKTOP_TS
    assert "function escapeClearsRecall" in DESKTOP_TS
    assert "function recallArmedAfterEdit" in DESKTOP_TS


def test_long_press_keeps_timestamp_and_adds_edit() -> None:
    assert "RecallDraft.latestIndex" in CHAT
    assert "showEditAsNew: index == recallIdx" in CHAT
    assert "model.editAsNewMessage(message.content)" in CHAT
    menu = _slice(CHAT, "struct BubbleTimestampMenu", "struct AttachmentShareSheet")
    assert "Button(stamp)" in menu
    assert ".disabled(true)" in menu
    assert 'Button("Copy")' in menu
    assert 'Button("Regenerate")' in menu
    assert "Button(Speak.label(speaking))" in menu
    assert "Button(RecallDraft.editAsNewMessage)" in menu
    header = _slice(menu, "} header: {", "}")
    assert "Text(stamp)" in header
    assert "Button" not in header
    assert ".font(.system(size: 12))" in header
    assert "foregroundStyle(.secondary)" in header
    # The disabled timestamp row stays; Edit is an extra item on that menu.
    plain = _slice(menu, "Button(stamp)", "else if showEditAsNew")
    assert ".disabled(true)" in plain
    assert "Button(RecallDraft.editAsNewMessage)" in plain
    assert "func editAsNewMessage" in MODEL
    assert "func recallLastSentFromArrowUp" in MODEL
    assert "func clearRecallFromEscape" in MODEL
    assert "RecallDraft.arrowUpRecalls" in MODEL
    assert "pendingComposerCaret = (text as NSString).length" in MODEL
    assert "wantsComposerFocus = true" in MODEL
    escape = _slice(CHAT, "onEscapeStop:", "onArrowUpRecall:")
    assert "stopGeneratingFromEscape" in escape
    assert "clearRecallFromEscape" in escape
    assert "jumpToLatestFromEscape" in escape
    stop_at = escape.find("stopGeneratingFromEscape")
    clear_at = escape.find("clearRecallFromEscape")
    jump_at = escape.find("jumpToLatestFromEscape")
    assert stop_at < clear_at < jump_at
    assert "if !model.clearRecallFromEscape" in escape


def test_hardware_up_arrow_and_empty_composer() -> None:
    assert "UIKeyCommand.inputUpArrow" in COMPOSER
    assert "keyboardUpArrow" in COMPOSER
    assert "onArrowUpRecall" in COMPOSER
    assert "markedTextRange" in COMPOSER
    assert "text.isEmpty" in COMPOSER
    keys = _slice(COMPOSER, "override var keyCommands", "@objc private func stopGeneratingFromEscape")
    assert "text.isEmpty && markedTextRange == nil" in keys
    assert "inputUpArrow" in keys
    presses = _slice(COMPOSER, "keyboardUpArrow", "keyboardReturn")
    assert "markedTextRange != nil || !text.isEmpty" in presses
    assert "onArrowUpRecall?()" in presses
    assert "arrowUpRecalls" in DESKTOP_APP
    assert "fillRecalledDraft" in DESKTOP_APP
    assert "pendingCaret.current = text.length" in DESKTOP_APP
    assert "escapeClearsRecall" in DESKTOP_APP
    stop_at = DESKTOP_APP.find("escapeStopsGenerating({")
    clear_at = DESKTOP_APP.find("escapeClearsRecall({")
    jump_at = DESKTOP_APP.find("escapeJumpsToLatest({")
    assert stop_at >= 0 and stop_at < clear_at < jump_at


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_recall_draft.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in DESKTOP_TS
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP_TS


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_long_press_keeps_timestamp_and_adds_edit,
        test_hardware_up_arrow_and_empty_composer,
        test_openapi_roadmap_ci_no_computer_pane,
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
