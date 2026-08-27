#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.21 iOS composer `/` skill autocomplete chrome lock.

1:1 agent composer only. Channel `/` is plain text. Reuses the `@`
typeahead overlay (240pt, elevated fill, 1pt border, 8pt radius).
Rows 44pt, name 14pt, no avatar. Empty list or no match → no popup.
Insert is `/name` plain text, not a chip.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
PICKER = (IOS / "SkillPicker.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")


def popup_open(skills: list[str], query: str | None, is_channel: bool) -> bool:
    if is_channel:
        return False
    if query is None:
        return False
    q = query.lower()
    return any(name.lower().startswith(q) for name in skills)


def insert_skill(draft: str, name: str) -> str:
    slash = draft.rfind("/")
    if slash < 0:
        return f"{draft}/{name} "
    rest = draft[slash + 1 :]
    pad = "" if rest.startswith(" ") else " "
    return f"{draft[:slash]}/{name}{pad}"


def test_chrome_lock() -> None:
    assert "static let popupWidth: CGFloat = 240" in PICKER
    assert "static let rowHeight: CGFloat = 44" in PICKER
    assert "static let nameSize: CGFloat = 14" in PICKER
    assert "static let cornerRadius: CGFloat = 8" in PICKER
    assert "SkillPicker.popupWidth" in CHAT
    assert "SkillPicker.rowHeight" in CHAT
    assert "SkillPicker.cornerRadius" in CHAT
    assert "AgentAvatar" not in CHAT[
        CHAT.index("if !isChannel, model.skillMenuOpen()") : CHAT.index(
            "} else if let query = mentionQuery"
        )
    ]


def test_one_to_one_popup_vs_channel_no_popup() -> None:
    skills = ["status", "workspace-note"]
    assert popup_open(skills, "", False) is True
    assert popup_open(skills, "sta", False) is True
    assert popup_open(skills, "", True) is False
    assert popup_open(skills, "sta", True) is False
    assert "isChannel: selectedAgent?.isChannel == true" in MODEL
    assert "if !isChannel, model.skillMenuOpen()" in CHAT
    assert "SkillPicker.agentId(conversation: selectedAgent)" in MODEL
    assert "lastAgentId" not in PICKER
    assert "lastAgentID" not in MODEL


def test_empty_or_no_match_no_popup() -> None:
    skills = ["status"]
    assert popup_open([], "", False) is False
    assert popup_open(skills, "nope", False) is False
    assert popup_open(skills, None, False) is False
    assert "No skills" not in CHAT[CHAT.index("ComposerBar") :]
    assert "popupOpen" in PICKER
    assert "!filter(skills, query: query).isEmpty" in PICKER


def test_insert_is_plain_text_not_chip() -> None:
    assert insert_skill("/sta", "status") == "/status "
    assert insert_skill("go /sta", "status") == "go /status "
    assert "func insertSkill" in MODEL
    assert 'let token = "/\\(skill.name)' in MODEL or 'let token = "/\\(skill.name)\\(pad)"' in MODEL
    assert "pickedMentions[skill" not in MODEL
    composer_chip = COMPOSER[
        COMPOSER.index("static func chipped") : COMPOSER.index("final class Coordinator")
    ]
    assert "@(" in composer_chip or "@([A-Za-z]" in composer_chip
    assert "/(" not in composer_chip and "/name" not in composer_chip


def test_reuses_mention_overlay_placement() -> None:
    bar = CHAT[CHAT.index("private struct ComposerBar") : CHAT.index("private struct MessageBubble")]
    assert bar.index("skillMenuOpen") < bar.index("mentionQuery")
    assert bar.index("skillMenuOpen") < bar.index("ComposerTextView")
    assert "frame(width: SkillPicker.popupWidth" in bar
    assert "RoundedRectangle(cornerRadius: SkillPicker.cornerRadius)" in bar


def main() -> int:
    tests = [
        test_chrome_lock,
        test_one_to_one_popup_vs_channel_no_popup,
        test_empty_or_no_match_no_popup,
        test_insert_is_plain_text_not_chip,
        test_reuses_mention_overlay_placement,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    if failed:
        print(f"{failed} failed")
        return 1
    print(f"{len(tests)} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
