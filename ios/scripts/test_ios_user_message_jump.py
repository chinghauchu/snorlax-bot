#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.25 jump between your sent messages from the keyboard.

Hardware command-shift-up / control-shift-up scrolls to the previous
user-RIGHT kind=message. command-shift-down scrolls to the next one.
The target is relative to the current viewport, under the sticky day
header, and the bubble gets a brief outline. Either end stays clamped.
A key repeat does not jump again. An empty composer does not own the
chord. A composer that already has text keeps selecting. IME and any
other text field keep the key. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "UserMessageJump.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "userMessageJump.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

EPSILON = 8
PHRASE = (
    "v1.25 jump between your sent messages from the keyboard (Cmd/Ctrl-Shift-Up scrolls to the "
    "previous user-RIGHT kind=message in the open chat's loaded transcript and Cmd/Ctrl-Shift-Down "
    "scrolls to the next one, relative to the current viewport; the target bubble gets a brief "
    "subtle highlight; either end stays clamped; a key repeat does not jump again; the chord still "
    "works from an empty composer and does not move the caret; when the composer has text, "
    "Cmd/Ctrl-Shift-Up and Cmd/Ctrl-Shift-Down keep selecting text; IME composition keeps the key; "
    "find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text "
    "field, and a focused widget, approve, or connect card keep the key; stick-to-bottom, the Jump "
    "chip, per-chat reading place, the sticky day header, and collapsed long messages stay; "
    "Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, "
    "Cmd/Ctrl-Shift-B, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, "
    "Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, "
    "Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, "
    "Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, Cmd/Ctrl-[ / ], Cmd/Ctrl-= / - / 0, "
    "Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts "
    "list includes Cmd/Ctrl Shift ↑ / ↓; iOS hardware command-shift-up and command-shift-down, and "
    "the control variants, jump the same way and Gestures & shortcuts lists the chord; no new HTTP)"
)


def scroll_offset(top, inset, limit):
    limit = max(0, limit)
    raw = top - max(0, inset)
    if raw <= 0:
        return 0
    if raw >= limit:
        return limit
    return raw


def view_line(scroll_top, inset=0, limit=10000, epsilon=EPSILON):
    inset = max(0, inset)
    limit = max(0, limit)
    return {
        "viewAnchor": scroll_top + inset,
        "scrollTop": scroll_top,
        "stickyInset": inset,
        "maxOffset": limit,
        "epsilon": epsilon,
    }


def settled(row, line):
    top = row["top"]
    if top is None:
        return False
    if top <= line["viewAnchor"] + line["epsilon"]:
        return True
    commanded = scroll_offset(top, line["stickyInset"], line["maxOffset"])
    clamped = commanded >= line["maxOffset"] - line["epsilon"]
    return clamped and line["scrollTop"] + line["epsilon"] >= commanded


def strictly_above(row, line):
    top = row["top"]
    if top is None:
        return False
    return top < line["viewAnchor"] - line["epsilon"]


def next_measured(rows, start):
    for index in range(start, len(rows)):
        if rows[index]["top"] is not None:
            return index
    return -1


def pick(rows, direction, line):
    listed = [row for row in rows if row["id"]]
    if not listed:
        return None
    if direction == "previous":
        last_above = None
        for index, row in enumerate(listed):
            if row["top"] is None:
                if next_measured(listed, index + 1) < 0:
                    break
                last_above = row["id"]
                continue
            if strictly_above(row, line):
                last_above = row["id"]
                continue
            return last_above
        return last_above
    last_settled = -1
    for index, row in enumerate(listed):
        if row["top"] is not None and settled(row, line):
            last_settled = index
            continue
        if row["top"] is None:
            later = next_measured(listed, index + 1)
            if later >= 0 and settled(listed[later], line):
                continue
            if last_settled >= 0:
                return row["id"]
            if later >= 0 and not settled(listed[later], line):
                return listed[0]["id"]
            continue
        if last_settled >= 0 and index > last_settled + 1:
            return listed[last_settled + 1]["id"]
        return row["id"]
    return None


def jump_direction(up=False, down=False, command=False, control=False, option=False, shift=False):
    if option or not shift or command == control:
        return None
    if up:
        return "previous"
    if down:
        return "next"
    return None


def test_pick_and_chord() -> None:
    sent = [
        {"id": "a", "top": 0},
        {"id": "b", "top": 400},
        {"id": "c", "top": 900},
    ]
    assert pick(sent, "previous", view_line(0)) is None
    assert pick(sent, "next", view_line(0)) == "b"
    assert pick(sent, "previous", view_line(400)) == "a"
    assert pick(sent, "next", view_line(400)) == "c"
    assert pick(sent, "next", view_line(900)) is None
    assert pick(
        [{"id": "long", "top": 100}, {"id": "later", "top": 800}],
        "previous",
        view_line(250),
    ) == "long"
    parked = view_line(400, inset=32, limit=400)
    assert pick(
        [{"id": "early", "top": 80}, {"id": "last", "top": 500}],
        "next",
        parked,
    ) is None
    assert pick(
        [{"id": "a", "top": 40}, {"id": "b", "top": None}, {"id": "c", "top": 900}],
        "previous",
        view_line(400),
    ) == "b"
    assert scroll_offset(500, 32, 2000) == 468
    assert scroll_offset(10, 32, 2000) == 0
    assert jump_direction(up=True, command=True, shift=True) == "previous"
    assert jump_direction(down=True, control=True, shift=True) == "next"
    assert jump_direction(up=True, command=True) is None
    assert jump_direction(up=True, shift=True) is None
    assert jump_direction(up=True, command=True, control=True, shift=True) is None
    assert jump_direction(up=True, command=True, option=True, shift=True) is None
    assert "static let stickyInset: CGFloat = 32" in SWIFT
    assert "static let epsilon: CGFloat = 8" in SWIFT
    assert "highlightSeconds: Double = 1.2" in SWIFT
    assert "No HTTP" in SWIFT
    assert "No HTTP" in DESKTOP


def test_wiring() -> None:
    start = CHAT.index("func userMessageJumpKey")
    end = CHAT.index("func userMessageJumpFromComposer", start)
    key = CHAT[start:end]
    assert "UserMessageJump.direction" in key
    assert "composerFocused" in key
    assert "userMessageJumpBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "applyUserMessageJump" in key
    assert key.index("shouldIgnoreRepeat") < key.index("applyUserMessageJump")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func userMessageJumpBlocked", end)]
    assert "applyUserMessageJump" in follow
    assert "model.send(" not in follow
    blocked = CHAT[
        CHAT.index("func userMessageJumpBlocked") : CHAT.index("func applyUserMessageJump")
    ]
    assert "findOpen" in blocked
    assert "shortcutsOpen" in blocked
    assert "lightbox != nil" in blocked
    assert "renameChatID != nil" in blocked
    apply = CHAT[
        CHAT.index("func applyUserMessageJump") : CHAT.index("func highlightUserJump")
    ]
    assert "isFromUser" in apply
    assert "isKindMessage" in apply
    assert "UserMessageJump.pick" in apply
    assert "UserMessageJump.scrollOffset" in apply
    assert "UserMessageJump.stickyInset" in apply
    assert "StickToBottom.onUserScroll" in apply
    assert "Show more" not in apply
    assert "expanded.toggle" not in apply
    assert 'className="bubble user"' in APP
    assert "data-user-jump-highlight" in APP
    assert "data-user-jump" in APP
    assert "user-jump-highlight" in CSS
    commands = COMPOSER[
        COMPOSER.index("func userMessageJumpCommands") : COMPOSER.index(
            "func userMessageJumpFromShortcut"
        )
    ]
    assert "inputUpArrow" in commands
    assert "inputDownArrow" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func userMessageJumpFromShortcut") : COMPOSER.index(
            "The first press of each step changes the size"
        )
    ]
    assert "markedTextRange != nil" in selector
    assert "!text.isEmpty" in selector
    assert "userJumpUpConsumed" in selector
    assert "userJumpDownConsumed" in selector
    assert "onUserMessageJump?(direction)" in selector
    assert selector.index("if userJumpUpConsumed") < selector.index("onUserMessageJump?(direction)")
    assert "text.isEmpty && markedTextRange == nil" in COMPOSER
    assert "userMessageJumpCommands()" in COMPOSER
    assert "UserMessageJump.keysLabel" in SHEET
    assert "UserMessageJump.action" in SHEET
    assert "Gestures & shortcuts" in SHEET
    assert "jumpHighlight" in CHAT
    assert "strokeBorder" in CHAT
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.25 " in ROADMAP
    assert "## 125. v1.25" in SPEC
    assert "python3 ios/scripts/test_ios_user_message_jump.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_pick_and_chord,
        test_wiring,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
