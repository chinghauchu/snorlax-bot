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
