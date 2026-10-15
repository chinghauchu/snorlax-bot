#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.14 collapse or expand tool traces from the keyboard.

Hardware command-shift-G or control-shift-G toggles every consecutive
tool-trace group in the open chat. If any group is expanded, collapse
all. If every group is collapsed, expand all. A single tool line is
not a group. The existing N tools chevron stays. The composer does not
own the chord and does not insert the letter. A key repeat does not
flap. IME and any other text field do. Nothing changes when no chat is
open or there is no group. No new HTTP. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ToolTraceGroups.swift").read_text(encoding="utf-8")
COMPACT = (IOS / "CompactToolTraces.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "toolTraceGroups.ts").read_text(encoding="utf-8")
STACKS = (ROOT / "desktop" / "src" / "compactToolTraces.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.14 collapse or expand tool traces from the keyboard (Cmd/Ctrl-Shift-G toggles "
    "every consecutive tool-trace group in the open chat's loaded transcript: if any "
    "group is expanded, collapse all; if every group is collapsed, expand all; a "
    "single tool line is not a group and stays as it is; the existing N tools chevron "
    "stays; the chord still works from the composer and does not insert text; a key "
    "repeat does not flap and does not insert; IME composition keeps the key; find, "
    "the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay "
    "text field, and a focused widget, approve, or connect card keep the key; nothing "
    "changes when no chat is open or there are no tool-trace groups; Cmd/Ctrl-K, "
    "Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, "
    "Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, "
    "Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-/, Cmd/Ctrl-1..9, "
    "Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; "
    "the shortcuts list includes Cmd/Ctrl Shift G; iOS hardware command-shift-G "
    "toggles those groups and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "g":
        return True
    return characters.lower() == "g"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def toggle_all(expanded, stacks):
    """stacks: list of (id, count). None when there is no 2+ group."""
    ids = [stack_id for stack_id, count in stacks if count >= 2]
    if not ids:
        return None
    next_ids = set(expanded)
    if any(stack_id in expanded for stack_id in ids):
        for stack_id in ids:
            next_ids.discard(stack_id)
    else:
        next_ids.update(ids)
    return next_ids


def test_chord_and_toggle() -> None:
    assert is_chord("g", command=True, shift=True) is True
    assert is_chord("G", control=True, shift=True) is True
    assert is_chord("g", command=True, shift=True, characters="g") is True
    assert is_chord("g") is False
    assert is_chord("g", command=True) is False
    assert is_chord("g", command=True, shift=True, option=True) is False
    assert is_chord("g", command=True, control=True, shift=True) is False
    assert is_chord("e", command=True, shift=True) is False
    assert is_chord(".", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert toggle_all(set(), []) is None
    assert toggle_all(set(), [("only", 1)]) is None
    expanded = toggle_all(set(), [("a", 2), ("c", 1), ("d", 3)])
    assert expanded == {"a", "d"}
    collapsed = toggle_all({"a"}, [("a", 2), ("c", 1), ("d", 3)])
    assert collapsed == set()
    again = toggle_all(collapsed, [("a", 2), ("d", 3)])
    assert again == {"a", "d"}
    assert 'static let keysLabel = "⌘⇧G"' in SWIFT
    assert 'static let action = "Collapse or expand tool traces"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "static func toggleAll" in COMPACT
    assert "shouldCollapse(count: $0.items.count)" in COMPACT
    assert "isToolTraceGroupsChord" in DESKTOP
    assert "toolTraceGroupsBlocked" in DESKTOP
    assert "toolTraceGroupsShouldToggle" in DESKTOP
    assert "toggleAllToolTraceGroups" in STACKS
    assert "No new HTTP" in DESKTOP


def test_existing_toggle_path() -> None:
    start = CHAT.index("func toolTraceGroupsKey")
    end = CHAT.index("func toggleToolTracesFromComposer", start)
    key = CHAT[start:end]
    assert "ToolTraceGroups.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "toolTraceGroupsBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "toggleAllToolTraceGroups()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("toggleAllToolTraceGroups()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "toggleAllToolTraceGroups()" in follow
    assert "CompactToolTraces.toggleAll" in follow
    assert "openChatToolStacks()" in follow
    assert "visibleMessages(for: agent)" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    commands = COMPOSER[
        COMPOSER.index("func toolTraceGroupCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "g"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func toggleToolTracesFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "toolTraceGroupsConsumed" in selector
    assert "onToggleToolTraces?()" in selector
    assert selector.index("if toolTraceGroupsConsumed") < selector.index(
        "toolTraceGroupsConsumed = true"
    )
    assert selector.index("toolTraceGroupsConsumed = true") < selector.index(
        "onToggleToolTraces?()"
    )
    assert "keyboardG" in COMPOSER
    assert "model.send(" not in commands
    assert "const onToggleToolTraces" in APP
    assert "toggleAllToolTraceGroups(prev, toolStacks)" in APP
    assert 'addEventListener("keydown", onToggleToolTraces, true)' in APP
    assert "toolTraceGroupsShouldToggle" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "ToolTraceGroups.keysLabel" in SHEET
    assert "ToolTraceGroups.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.14 " in ROADMAP
    assert "## 114. v1.14" in SPEC
    assert "python3 ios/scripts/test_ios_tool_trace_groups.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_toggle,
        test_existing_toggle_path,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
