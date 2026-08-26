# SPDX-License-Identifier: Apache-2.0
"""v0.2 handoff pack + v0.4 report-back pack + 1:1 brief.

Prompt-only; never stored as a quote bubble.
"""

from __future__ import annotations

import json
import re
from typing import Any

BRIEF_MAX_MESSAGES = 8
BRIEF_MAX_CHARS = 2000
# Involve kicker leaking into bubble body ("from Mary: …").
FROM_KICKER_RE = re.compile(r"^from\s+[^:\n]+:\s*", re.IGNORECASE)


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


REPORT_MISS = "was not reached"


def report_pack(
    *,
    from_agent: dict[str, Any],
    result: str,
    thread_id: str,
    user_ask: str = "",
) -> dict[str, Any]:
    return {
        "from": {
            "id": from_agent["id"],
            "name": from_agent["name"],
            "title": from_agent.get("title") or "",
        },
        "result": strip_involve_kicker(result),
        "threadId": thread_id,
        "userAsk": user_ask,
    }


def is_report_pack(pack: dict[str, Any] | None) -> bool:
    return bool(pack) and "result" in pack and "from" in pack


def strip_involve_kicker(content: str) -> str:
    """Drop a leading `from {Name}:` kicker so it is not shown as message text."""
    return FROM_KICKER_RE.sub("", content, count=1).lstrip()


def pack_prompt(pack: dict[str, Any]) -> str:
    return json.dumps(pack, ensure_ascii=False, indent=2)
