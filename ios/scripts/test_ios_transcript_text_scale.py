#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.24 adjustable transcript text size from the keyboard.

Hardware command-= / control-= and command-+ step the transcript
text larger. command-- steps smaller. command-0 resets to 100%.
The steps are 85, 92, 100, 110, 120, and 130 percent. Dynamic Type
is the base. The choice persists in UserDefaults. The composer does
not own the chord and does not insert the character. A key repeat
does not step again. IME and any other text field do. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "TranscriptTextScale.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
MENTION = (IOS / "Components.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
TRACES = (IOS / "CompactToolTraces.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "transcriptTextScale.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

STEPS = [85, 92, 100, 110, 120, 130]
PHRASE = (
    "v1.24 adjustable transcript text size from the keyboard (Cmd/Ctrl-= and Cmd/Ctrl-+ make "
    "the chat transcript text one step larger, Cmd/Ctrl-- one step smaller, and Cmd/Ctrl-0 "
    "resets to 100%; the steps are 85%, 92%, 100%, 110%, 120%, and 130%; message bubble text, "
    "code blocks, and tool traces use that scale together while padding, images, and the rest "
    "of the chrome stay put; the choice persists in local storage; the chord still works from "
    "the composer and does not insert text; a key repeat does not step again and does not insert; "
    "the ends stay clamped; IME composition keeps the key; find, the quick switcher, the shortcuts "
    "overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, "
    "or connect card keep the key; Cmd/Ctrl-1 through Cmd/Ctrl-9 still open a chat and Cmd/Ctrl-0 "
    "does not; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, "
    "Cmd/Ctrl-Shift-B, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, "
    "Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, "
    "Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, "
    "Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, Cmd/Ctrl-[ / ], Alt+Up/Down, PageUp/PageDown, "
    "Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes "
    "Cmd/Ctrl = / + / - / 0; iOS hardware command-=, command-+, command--, and command-0, and the "
    "control variants, adjust the same steps with Dynamic Type as the base size, the choice "
    "persists in UserDefaults, and Gestures & shortcuts lists the chord and has Smaller, Larger, "
    "and Default; no new HTTP)"
)


def normalize(percent):
    return percent if percent in STEPS else 100


def apply_step(percent, step):
    current = normalize(percent)
    if step == "reset":
        return 100
    index = STEPS.index(current)
    if step == "larger":
        return STEPS[min(index + 1, len(STEPS) - 1)]
    return STEPS[max(index - 1, 0)]


def text_step(key, characters="", command=False, control=False, option=False, shift=False):
    if option or command == control:
        return None
    tokens = [str(key), characters]
    if "=" in tokens or "+" in tokens:
        return "larger"
    if "-" in tokens or "_" in tokens:
        return "smaller"
    if shift:
        return None
    if "0" in tokens:
        return "reset"
    return None


def test_steps_and_chord() -> None:
    assert apply_step(100, "larger") == 110
    assert apply_step(130, "larger") == 130
    assert apply_step(100, "smaller") == 92
    assert apply_step(85, "smaller") == 85
    assert apply_step(120, "reset") == 100
    assert apply_step(40, "larger") == 110
    assert text_step("=", command=True) == "larger"
    assert text_step("+", control=True, shift=True) == "larger"
    assert text_step("-", command=True) == "smaller"
    assert text_step("_", control=True, shift=True) == "smaller"
    assert text_step("0", command=True) == "reset"
    assert text_step("0", command=True, shift=True) is None
    assert text_step("1", command=True) is None
    assert text_step("=", command=True, control=True) is None
    assert text_step("=", command=True, option=True) is None
    assert text_step("=") is None
    assert "UIFontMetrics(forTextStyle: .body)" in SWIFT
    assert "snorlax.transcriptTextScale" in SWIFT
    assert "snorlax.transcriptTextScale" in DESKTOP
    assert "[85, 92, 100, 110, 120, 130]" in SWIFT
    assert "Dynamic Type" in SWIFT


def test_wiring() -> None:
    start = CHAT.index("func transcriptTextKey")
    end = CHAT.index("func transcriptTextFromComposer", start)
    key = CHAT[start:end]
    assert "TranscriptTextScale.step" in key
    assert "composerFocused" in key
    assert "transcriptTextBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "model.adjustTranscriptText" in key
    assert key.index("shouldIgnoreRepeat") < key.index("model.adjustTranscriptText")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func transcriptTextBlocked", end)]
    assert "model.adjustTranscriptText" in follow
    assert "model.send(" not in follow
    blocked = CHAT[
        CHAT.index("func transcriptTextBlocked") : CHAT.index("func chatHistoryFromComposer")
    ]
    assert "findOpen" in blocked
    assert "shortcutsOpen" in blocked
    assert "lightbox != nil" in blocked
    assert "renameChatID != nil" in blocked
    assert "transcriptTextPercent" in CHAT
    assert "func adjustTranscriptText" in MODEL
    assert "TranscriptTextScale.read()" in MODEL
    assert "TranscriptTextScale.write" in MODEL
    assert "UserDefaults" in SWIFT
    commands = COMPOSER[
        COMPOSER.index("func transcriptTextCommands") : COMPOSER.index(
            "func transcriptTextFromShortcut"
        )
    ]
    assert 'input: input' in commands or 'input: input,' in commands
    assert '"="' in commands
    assert '"+"' in commands
    assert '"-"' in commands
    assert '"0"' in commands
    assert "modifierFlags: .command" in commands or "UIKeyModifierFlags.command" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func transcriptTextFromShortcut") : COMPOSER.index(
            "The first press of each direction steps"
        )
    ]
    assert "markedTextRange != nil" in selector
    assert "transcriptTextLargerConsumed" in selector
    assert "transcriptTextSmallerConsumed" in selector
    assert "transcriptTextResetConsumed" in selector
    assert "onTranscriptText?(step)" in selector
    assert selector.index("if transcriptTextLargerConsumed") < selector.index("onTranscriptText?(step)")
    assert "model.adjustTranscriptText" in LIST
    assert "TranscriptTextScale.keysLabel" in SHEET
    assert "TranscriptTextScale.smallerLabel" in SHEET
    assert "TranscriptTextScale.largerLabel" in SHEET
    assert "TranscriptTextScale.resetLabel" in SHEET
    assert "Gestures & shortcuts" in SHEET
    assert "metrics.bodyFont" in MARKDOWN
    assert "metrics.fenceFont" in MARKDOWN
    assert "metrics.codeFont" in MARKDOWN
    assert "metrics.bodyFont" in MENTION
    assert "TranscriptTextScale.points" in PLAIN
    assert "metrics.traceFont" in TRACES
    assert "data-transcript-scale" in APP
    assert "--transcript-scale" in CSS
    assert ".transcript .bubble pre" in CSS
    assert ".transcript .tool-trace" in CSS
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.24 " in ROADMAP
    assert "## 124. v1.24" in SPEC
    assert "python3 ios/scripts/test_ios_transcript_text_scale.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_steps_and_chord,
        test_wiring,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
