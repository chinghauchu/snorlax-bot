# SPDX-License-Identifier: Apache-2.0
"""v0.2 handoff pack + 1:1 brief. Prompt-only; never stored as a quote bubble."""

from __future__ import annotations

import json
from typing import Any

BRIEF_MAX_MESSAGES = 8
BRIEF_MAX_CHARS = 2000


def format_brief(messages: list[dict[str, Any]]) -> str:
    """Last-N 1:1 turns as `Name: text`, drop oldest until under the char cap."""
    lines: list[str] = []
    for message in messages[-BRIEF_MAX_MESSAGES:]:
        sender = message.get("senderId") or message.get("sender_id") or ""
        name = (
            "User"
            if sender == "user"
            else (
                message.get("senderName")
                or message.get("sender_name")
                or "Agent"
            )
        )
        body = (message.get("content") or "").replace("\n", " ").strip()
        lines.append(f"{name}: {body}")
    while lines and sum(len(line) + 1 for line in lines) - 1 > BRIEF_MAX_CHARS:
        lines.pop(0)
    return "\n".join(lines)


def wake_pack(
    *,
    originating: dict[str, Any],
    user_ask: str,
    brief: str,
    mentioned_ids: list[str],
) -> dict[str, Any]:
    return {
        "originating": {
            "id": originating["id"],
            "name": originating["name"],
            "title": originating.get("title") or "",
        },
        "userAsk": user_ask,
        "brief": brief,
        "mentionedIds": list(mentioned_ids),
    }


def pack_prompt(pack: dict[str, Any]) -> str:
    return json.dumps(pack, ensure_ascii=False, indent=2)
