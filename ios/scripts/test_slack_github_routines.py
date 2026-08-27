#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.23 iOS Add-routine Slack/GitHub chrome lock.

Segments Slack/GitHub only when that MCP plugin is connected (omit, do
not disable). One 12pt segmented row. Slack field 14pt placeholder #eng
plus 12pt muted `Channel the bot is in.` GitHub placeholder owner/name
plus 12pt muted `One repo. No wildcards.` Primary Add 44pt disabled
until name + skill + channel/repo. No event picker. No Connect CTA.
No marketplace. Copy stays webhook-only.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SHEET = (IOS / "ProfileSheet.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
MODELS = (IOS / "Models.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")


def add_sheet() -> str:
    start = SHEET.index("private struct AddRoutineSheet")
    end = SHEET.index("private struct AddSkillSheet")
    return SHEET[start:end]


def test_segments_omit_unless_connected() -> None:
    add = add_sheet()
    assert 'case slack = "Slack"' in add
    assert 'case github = "GitHub"' in add
    assert "slackOn" in add
    assert "githubOn" in add
    assert "visibleModes" in add
    assert "Plugin.kindConnected" in add or "kindConnected" in add
    assert ".schedule, .webhook" in add
    assert "if slackOn { rows.append(.slack) }" in add
    assert "if githubOn { rows.append(.github) }" in add
    assert "Mode.allCases" not in add
    assert ".disabled(" not in add or 'disabled(saving || !model.isConfigured || !canAdd)' in add
    assert "disabledSlack" not in add
    assert '.font(.system(size: 12))' in add
    assert '.pickerStyle(.segmented)' in add


def test_slack_github_fields_and_hints() -> None:
    add = add_sheet()
    assert 'prompt: Text("#eng")' in add
    assert 'Text("Channel the bot is in.")' in add
    assert 'prompt: Text("owner/name")' in add
    assert 'Text("One repo. No wildcards.")' in add
    assert ".font(.system(size: 14))" in add
    assert 'minHeight: 44' in add
    assert "event picker" not in add.lower()
    assert "pr-opened" not in add
    assert "marketplace" not in add.lower()
    # kindConnected is the plugin-status helper, not a Connect CTA.
    assert "Connect Slack" not in add
    assert "Connect GitHub" not in add
    assert "Connect CTA" not in add
    assert 'Text("Connect")' not in add
    assert "Button(" not in add or 'Button("Add"' in add


def test_add_disabled_until_channel_or_repo() -> None:
    add = add_sheet()
    assert "case .slack:" in add
    assert "case .github:" in add
    assert "channel" in add
    assert "repo" in add
    assert ".disabled(saving || !model.isConfigured || !canAdd)" in add
    assert "xmark" in add


def test_post_channel_repo_not_label() -> None:
    add_model = MODEL[
        MODEL.index("func addRoutine") : MODEL.index("func removeRoutine")
    ]
    assert 'type: "slack"' in add_model
    assert "channel: channel" in add_model
    assert 'type: "github"' in add_model
    assert "repo: repo" in add_model
    assert 'type: "webhook"' in add_model
    assert "label:" not in add_model
    trigger = TYPES[
        TYPES.index("struct RoutineTrigger") : TYPES.index("struct RoutineCreate")
    ]
    assert "var channel: String?" in trigger
    assert "var repo: String?" in trigger


def test_copy_stays_webhook_only() -> None:
    routines = SHEET[
        SHEET.index("private var routinesList") : SHEET.index(
            "private var skillsList"
        )
    ]
    assert "showsWebhookCopy" in routines
    assert "Copy webhook URL" in routines or "Copy" in routines
    assert "kindConnected" in MODELS


def test_channel_pane_has_no_add_routine_listeners() -> None:
    channel = SHEET[
        SHEET.index("channelPane") : SHEET.index("channelEditForm")
    ]
    assert "AddRoutineSheet" not in channel
    assert "Channel the bot is in." not in channel


def main() -> int:
    tests = [
        test_segments_omit_unless_connected,
        test_slack_github_fields_and_hints,
        test_add_disabled_until_channel_or_repo,
        test_post_channel_repo_not_label,
        test_copy_stays_webhook_only,
        test_channel_pane_has_no_add_routine_listeners,
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
