# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from tests.conftest import AUTH


FORBIDDEN = ("instructions", "created_at", "attachments", "AgentList")


def test_protocol_openapi_is_locked_v0_contract() -> None:
    text = Path(__file__).resolve().parents[2].joinpath(
        "protocol", "openapi.yaml"
    ).read_text(encoding="utf-8")
    lowered = text
    for token in FORBIDDEN:
        assert token not in lowered, f"protocol/openapi.yaml still contains {token!r}"
    assert "info:\n  title: Snorlax-Bot" in text
    assert "createdAt" in text
    assert "updatedAt" in text
    assert "agentId" in text
    assert "const: Snorlax-Bot" in text
    assert "New agent" in text
    assert "snorlax-bot-group" in text
    assert "Never reuse `snorlax-bot` as the channel transcript" in text
    assert "kind=channel" in text
    assert "threadId" in text
    assert "kind=handoff" in text
    assert "An empty agent roster is OK" in text
    assert "kind=agent including seed" in text
    assert "Never treat snorlax-bot-group as an agent profile" in text
    assert "seeded agent cannot be deleted" not in text
    assert "No new upload route" in text
    assert "identity PATCH is 409" in text
    assert "Seeded channel cannot be deleted" not in text
    assert "seeded channel cannot be deleted" not in text
    assert "DELETE of kind=channel including seed" in text
    assert "`snorlax-bot-group` is 204" in text
    assert "User-created channel DELETE is 204" in text
    assert "last-selected extra channel" not in text
    assert "body `channelId`" in text
    assert "do not recreate seed" in text
    assert "kind=channel" in text
    assert "report-back" in text
    assert "tool.start" in text
    assert "tool.done" in text
    assert "ToolTrace" in text
    assert "workspaces" in text
    assert "not a picker for a folder on the host Mac" in text
    assert "Shell has no extra network" in text
    assert "web_search / web_fetch only" in text
    assert "Tools auto-run" in text
    assert "SNORLAX_SEARCH_PROVIDER" in text
    assert "sharedProject" in text
    assert "kind=tool" in text
    assert "enum: [message, handoff, tool]" in text
    assert "always finishes with a normal assistant" in text
    assert "projectPath" not in text
    assert "folderPath" not in text
    assert "not persisted as Message" not in text
    assert "SSE, chat-only (no tools)" not in text
