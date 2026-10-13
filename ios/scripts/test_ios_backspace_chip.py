#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.87 Backspace removes the last attachment chip when the composer is empty.

Desktop: plain Backspace in an empty composer removes the rightmost
pending chip, one per keypress, and keeps focus. Text still edits.
iOS: hardware Delete uses the same rule. The on-screen Delete key
matches because UITextView routes both through deleteBackward.

No chips does nothing. The chip X stays. Nothing auto-sends.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "BackspaceChip.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
DESKTOP_TS = (ROOT / "desktop" / "src" / "backspaceChip.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.87 Backspace removes the last attachment chip (when the composer "
    "text is empty, desktop Backspace or iOS hardware Delete removes the "
    "rightmost pending chip, one per keypress; with text, Backspace edits "
    "the text; no chips does nothing; the chip X stays; nothing auto-sends; "
    "the on-screen Delete key matches; no new HTTP)"
)


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def allows(composer_text: str, composing: bool, chord: bool) -> bool:
    return (not composing) and (not chord) and composer_text == ""


def removes_last(composer_text: str, chip_count: int, composing: bool, chord: bool) -> bool:
    return allows(composer_text, composing, chord) and chip_count > 0


def without_last(chips: list[str]) -> list[str]:
    if not chips:
        return chips
    return chips[:-1]


def test_rules_match_desktop() -> None:
    assert removes_last("", 2, False, False) is True
    assert removes_last("", 1, False, False) is True
    assert removes_last("", 0, False, False) is False
    assert removes_last("a", 2, False, False) is False
    assert removes_last(" ", 2, False, False) is False
    assert removes_last("\n", 2, False, False) is False
    assert removes_last("", 2, True, False) is False
    assert removes_last("", 2, False, True) is False
    chips = ["a", "b", "c"]
    chips = without_last(chips)
    assert chips == ["a", "b"]
    chips = without_last(chips)
    assert chips == ["a"]
    assert without_last([]) == []
    assert "static func composerAllowsRemove" in SWIFT
    assert "static func removesLast" in SWIFT
    assert "static func withoutLast" in SWIFT
    assert "composerAllowsChipBackspace" in DESKTOP_TS
    assert "backspaceRemovesLastChip" in DESKTOP_TS
    assert "withoutLastChip" in DESKTOP_TS
    assert 'input.key !== "Backspace"' in DESKTOP_TS
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP_TS


def test_ios_delete_and_chip_x() -> None:
    delete = _slice(COMPOSER, "override func deleteBackward()", "override func pressesEnded")
    assert "BackspaceChip.composerAllowsRemove" in delete
    assert "markedTextRange != nil" in delete
    assert "onBackspaceRemoveChip?() == true" in delete
    assert "super.deleteBackward()" in delete
    assert "resignFirstResponder" not in delete
    assert "keyboardDeleteOrBackspace" in COMPOSER
    assert "mods.contains(.command)" in COMPOSER
    assert "mods.contains(.alternate)" in COMPOSER
    assert "mods.contains(.control)" in COMPOSER
    assert "mods.contains(.shift)" in COMPOSER
    assert "var onBackspaceRemoveChip: (() -> Bool)?" in COMPOSER
    assert "onBackspaceRemoveChip:" in CHAT
    assert "model.removeLastPendingChipFromBackspace()" in CHAT
    assert 'accessibilityLabel("Remove \\(row.name)")' in CHAT
    assert "model.removePending(id: row.id)" in CHAT
    callback = _slice(CHAT, "onBackspaceRemoveChip:", "sendMuted:")
    assert "model.send(" not in callback
    body = _slice(MODEL, "func removeLastPendingChipFromBackspace", "func openAttachment")
    assert "BackspaceChip.removesLast" in body
    assert "BackspaceChip.withoutLast" in body
    assert "removePending(id: last.id)" in body
    assert "wantsComposerFocus = true" in body
    assert "send()" not in body
    assert "computerTakeoverOpen" in body
    keys = _slice(DESKTOP_APP, "function onComposerKey", "function insertDraftAtCaret")
    branch = _slice(keys, "backspaceRemovesLastChip", "sendMutedWhileGenerating")
    assert "event.currentTarget.value" in branch
    assert "removeLastPendingChip()" in branch
    assert "onSend(" not in branch
    assert "setDraft(" not in branch
    assert 'onClick={() => removePending(row.id)}' in DESKTOP_APP


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.87 " in ROADMAP
    assert "python3 ios/scripts/test_ios_backspace_chip.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in DESKTOP_APP


def main() -> int:
    tests = [
        test_rules_match_desktop,
        test_ios_delete_and_chip_x,
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
