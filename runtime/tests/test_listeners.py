# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.listeners import (
    github_repo_valid,
    parse_plugin_event,
    slack_label,
    github_label,
)


def test_github_repo_valid() -> None:
    assert github_repo_valid("owner/name") is True
    assert github_repo_valid("chinghauchu/snorlax-bot") is True
    assert github_repo_valid("") is False
    assert github_repo_valid("  ") is False
    assert github_repo_valid("owner") is False
    assert github_repo_valid("owner/") is False
    assert github_repo_valid("/name") is False
    assert github_repo_valid("owner/*") is False
    assert github_repo_valid("*/name") is False
    assert github_repo_valid("*") is False
    assert github_repo_valid("owner/name/extra") is False
    assert github_repo_valid("owner/name*") is False


def test_labels() -> None:
    assert slack_label("#eng") == "Slack #eng"
    assert github_label("owner/name") == "GitHub owner/name"


def test_parse_slack_message() -> None:
    event = parse_plugin_event(
        "slack",
        {"type": "message", "channel": "#eng", "text": "hi"},
    )
    assert event == {"kind": "slack", "type": "message", "channel": "#eng"}


def test_parse_github_pr_actions() -> None:
    opened = parse_plugin_event(
        "github",
        {
            "action": "opened",
            "pull_request": {"number": 1},
            "repository": {"full_name": "owner/name"},
        },
    )
    assert opened == {
        "kind": "github",
        "repo": "owner/name",
        "event": "pr-opened",
    }
    pushed = parse_plugin_event(
        "github",
        {
            "action": "synchronize",
            "pull_request": {},
            "repository": {"full_name": "owner/name"},
        },
    )
    assert pushed and pushed["event"] == "pr-pushed"
    merged = parse_plugin_event(
        "github",
        {
            "action": "closed",
            "pull_request": {"merged": True},
            "repository": {"full_name": "owner/name"},
        },
    )
    assert merged and merged["event"] == "pr-merged"
    issue = parse_plugin_event(
        "github",
        {"action": "opened", "issue": {"number": 1}, "repository": {"full_name": "owner/name"}},
    )
    assert issue is None
