# SPDX-License-Identifier: Apache-2.0
"""Shared POST /v1/agents create path. Tools wrap this; no second create API."""

from __future__ import annotations

import json
from typing import Any

from snorlax_runtime import KIND_AGENT, KIND_CHANNEL

ERR_MISSING_NAME = "Error: missing name"


class RosterCreateError(Exception):
    """Same 422 cases as POST /v1/agents. Tools surface these as Error:."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _parse_args(arguments: str) -> dict[str, Any]:
    try:
        args = json.loads(arguments) if (arguments or "").strip() else {}
    except json.JSONDecodeError:
        return {}
    if not isinstance(args, dict):
        return {}
    return args


def _member_ids_from_args(args: dict[str, Any]) -> list[str] | None:
    if "memberIds" not in args and "member_ids" not in args:
        return None
    raw = args.get("memberIds")
    if raw is None:
        raw = args.get("member_ids")
    if raw is None:
        return []
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw]


def channel_member_ids(
    roster: list[dict[str, Any]],
    requested: list[str],
    *,
    snapshot_if_empty: bool,
) -> list[str]:
    """Resolve memberIds the same way POST /v1/agents kind=channel does.

    Empty requested + snapshot_if_empty snapshots every current agent.
    Unknown ids and channel ids raise RosterCreateError (HTTP 422 today).
    """
    agents = [a for a in roster if a.get("kind") != KIND_CHANNEL]
    channel_ids = {a["id"] for a in roster if a.get("kind") == KIND_CHANNEL}
    agent_ids = {a["id"] for a in agents}
    if not requested:
        if snapshot_if_empty:
            return [a["id"] for a in agents]
        return []
    member_ids: list[str] = []
    seen: set[str] = set()
    for raw_id in requested:
        if raw_id in seen:
            continue
        if raw_id in channel_ids:
            raise RosterCreateError("memberIds must be agent ids")
        if raw_id not in agent_ids:
            raise RosterCreateError("Unknown member id")
        seen.add(raw_id)
        member_ids.append(raw_id)
    return member_ids


async def create_agent_row(
    store: Any,
    *,
    name: str,
    title: str = "",
    description: str = "",
    avatar: str | None = None,
) -> dict[str, Any]:
    """kind=agent on existing POST /v1/agents. Empty name is missing name."""
    trimmed = (name or "").strip()
    if not trimmed:
        raise RosterCreateError("missing name")
    return await store.create_agent(trimmed, title or "", description or "", avatar)


async def create_channel_row(
    store: Any,
    *,
    name: str,
    title: str = "",
    description: str = "",
    avatar: str | None = None,
    member_ids: list[str] | None = None,
) -> dict[str, Any]:
    """kind=channel on existing POST /v1/agents. Empty memberIds snapshots."""
    trimmed = (name or "").strip()
    if not trimmed:
        raise RosterCreateError("missing name")
    roster = await store.list_agents()
    members = channel_member_ids(
        roster, list(member_ids or []), snapshot_if_empty=True
    )
    return await store.create_channel(
        trimmed, title or "", description or "", avatar, members
    )


def _created_text(row: dict[str, Any]) -> str:
    name = str(row.get("name") or "").strip() or "agent"
    kind = str(row.get("kind") or KIND_AGENT)
    agent_id = str(row.get("id") or "")
    lines = [f"Created {name}", f"id: {agent_id}", f"kind: {kind}"]
    return "\n".join(lines)


async def create_agent_tool(arguments: str, *, store: Any | None = None) -> str:
    args = _parse_args(arguments)
    name = str(args.get("name") or "").strip()
    if not name:
        return ERR_MISSING_NAME
    if store is None:
        return ERR_MISSING_NAME
    title = str(args.get("title") or "")
    description = str(args.get("description") or "")
    try:
        row = await create_agent_row(
            store, name=name, title=title, description=description
        )
    except RosterCreateError as exc:
        return f"Error: {exc.message}"
    return _created_text(row)


async def create_channel_tool(arguments: str, *, store: Any | None = None) -> str:
    args = _parse_args(arguments)
    name = str(args.get("name") or "").strip()
    if not name:
        return ERR_MISSING_NAME
    if store is None:
        return ERR_MISSING_NAME
    try:
        row = await create_channel_row(
            store, name=name, member_ids=_member_ids_from_args(args)
        )
    except RosterCreateError as exc:
        return f"Error: {exc.message}"
    return _created_text(row)
