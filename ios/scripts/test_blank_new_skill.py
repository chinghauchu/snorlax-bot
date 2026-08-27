#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.22 iOS blank New skill chrome lock.

Skills header trailing 12pt Add. Empty still No skills yet. — Add still
shows.  Sheet title New skill (not Add skill). Name 14pt. Body is
TextEditor 12pt/1.45 mono, min-height 200pt — source, not preview.
Primary Add 44pt, disabled until name AND body. × discards. Record-to-skill
POST { name } without body stays. No new HTTP route.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SHEET = (IOS / "ProfileSheet.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
TAKEOVER = (IOS / "ComputerTakeover.swift").read_text(encoding="utf-8")


def can_add(name: str, body: str) -> bool:
    return bool(name.strip() and body.strip())


def test_header_add_shows_when_empty() -> None:
    skills = SHEET[
        SHEET.index("private var skillsList") : SHEET.index("private var channelPane")
    ]
    assert 'Text("Skills")' in skills
    assert 'Button("Add")' in skills
    assert "showAddSkill = true" in skills
    assert "No skills yet." in skills
    assert skills.index('Button("Add")') < skills.index("No skills yet.")
    assert 'Button("Edit")' in skills
    assert 'Button("Remove")' in skills
    assert skills.index('Button("Edit")') < skills.index('Button("Remove")')
    assert "New skill" not in skills
    assert 'size: 12' in skills


def test_new_skill_sheet_is_source_not_preview() -> None:
    add = SHEET[
        SHEET.index("private struct AddSkillSheet") : SHEET.index(
            "private struct EditSkillSheet"
        )
    ]
    assert 'navigationTitle("New skill")' in add
    assert "Add skill" not in add
    assert 'TextField("Name"' in add
    assert "size: 14" in add
    assert "TextEditor" in add
    assert "design: .monospaced" in add
    assert "size: 12" in add
    assert "minHeight: 200" in add
    assert "12 * 0.45" in add
    assert 'Button("Add")' in add
    assert "minHeight: 44" in add
    assert "canAdd" in add
    assert ".disabled(saving || !model.isConfigured || !canAdd)" in add
    assert "Markdown" not in add
    assert "xmark" in add
    assert "model.addSkill" in add
    assert can_add("Inbox", "Sort the inbox.") is True
    assert can_add("  ", "body") is False
    assert can_add("Inbox", "  ") is False
    assert can_add("", "") is False


def test_post_name_body_from_add_record_omits_body() -> None:
    add_model = MODEL[
        MODEL.index("func addSkill") : MODEL.index("func saveSkill")
    ]
    assert "client.createSkill" in add_model
    assert "name: trimmedName" in add_model
    assert "body: trimmedBody" in add_model
    record = MODEL[
        MODEL.index("func saveRecordedSkill") : MODEL.index("func setRoutineEnabled")
    ]
    assert "client.createSkill(agentId: agentId, name: trimmed)" in record
    assert "body:" not in record
    create = CLIENT[CLIENT.index("func createSkill") :]
    assert "body: String? = nil" in create
    assert "SkillCreate(name: name, body: body)" in create
    takeover_save = TAKEOVER[
        TAKEOVER.index("private func saveSkill") : TAKEOVER.index(
            "private struct RecordDot"
        )
    ]
    assert "saveRecordedSkill" in takeover_save
    assert "body:" not in takeover_save


def test_channel_pane_has_no_add_skill() -> None:
    channel = SHEET[
        SHEET.index("channelPane") : SHEET.index("channelEditForm")
    ]
    assert "AddSkillSheet" not in channel
    assert "showAddSkill" not in channel
    assert "New skill" not in channel


def main() -> int:
    tests = [
        test_header_add_shows_when_empty,
        test_new_skill_sheet_is_source_not_preview,
        test_post_name_body_from_add_record_omits_body,
        test_channel_pane_has_no_add_skill,
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
